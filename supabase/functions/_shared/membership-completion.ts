import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "./stripe.ts";
import { firstLessonDate } from "./membership-pricing.ts";
import { formatPTDate, formatPTTime, sendAndLogBookingConfirmation } from "./textmagic.ts";
import { buildManageLink } from "./manage-link.ts";
import { fetchClosureDateSet, fetchClosureSchedule } from "./closure-schedule.ts";
import { buildMembershipOccurrenceRows } from "./membership-occurrences.ts";



type JsonObject = Record<string, unknown>;

export interface MembershipCompletionResult {
  membershipId: string;
  subscriptionId: string;
  occurrenceCount: number;
  firstChargeCents: number;
  monthlyCents: number;
  alreadyProcessed: boolean;
}

/**
 * Thrown when another caller holds the claim on the same pending membership and
 * has not written its subscription id yet. The caller turns this into a 202 so a
 * parent who has just paid never sees an error.
 */
export class MembershipCompletionInProgressError extends Error {
  constructor(public readonly pendingId: string) {
    super("Membership completion already in progress");
    this.name = "MembershipCompletionInProgressError";
  }
}

/** How long a losing caller waits for the winner to write the subscription id. */
const LOSER_WAIT_MS = 25_000;
const LOSER_POLL_INTERVAL_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readPendingSubscriptionId(pendingId: string): Promise<string | undefined> {
  const { data } = await supabase
    .from("pending_memberships")
    .select("payload")
    .eq("id", pendingId)
    .maybeSingle();
  return asString(asRecord(data?.payload).stripe_subscription_id);
}


const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing backend service configuration");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

function asRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  const obj = asRecord(value);
  const id = obj.id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stripeErrorDetails(error: unknown): JsonObject {
  const e = asRecord(error);
  const raw = asRecord(e.raw);
  return {
    type: e.type,
    code: e.code,
    message: e.message,
    raw: raw.message,
    param: e.param,
  };
}

export async function completeMembershipFromSetupSessionId(
  sessionId: string,
  env: StripeEnv,
): Promise<MembershipCompletionResult> {
  const stripe = createStripeClient(env);
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return completeMembershipFromSetupSession(session, env);
}

export async function completeMembershipFromSetupSession(
  sessionInput: unknown,
  env: StripeEnv,
): Promise<MembershipCompletionResult> {
  const session = asRecord(sessionInput);
  const sessionId = asString(session.id);
  if (!sessionId) throw new Error("Checkout session id missing");
  if (session.mode !== "setup") throw new Error(`Checkout session ${sessionId} is not setup mode`);

  const setupIntentId = asString(session.setup_intent);
  if (!setupIntentId) throw new Error(`No setup_intent on checkout session ${sessionId}`);

  const customerId = asString(session.customer);
  if (!customerId) throw new Error(`No customer on checkout session ${sessionId}`);

  const { data: pendingBySession, error: lookupErr } = await supabase
    .from("pending_memberships")
    .select("id, payload")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (lookupErr) {
    throw new Error(`Pending membership lookup failed: ${lookupErr.message}`);
  }
  if (!pendingBySession?.id) {
    throw new Error(`Pending membership not found for checkout session ${sessionId}`);
  }

  const pendingId = pendingBySession.id as string;
  const payload = asRecord(pendingBySession.payload);
  const existingSubscriptionId = asString(payload.stripe_subscription_id);
  if (existingSubscriptionId) {
    return ensureMembershipRecord({
      subscriptionId: existingSubscriptionId,
      customerId,
      pendingId,
      sessionId,
      payload,
      env,
      alreadyProcessed: true,
    });
  }

  // Atomic claim. Exactly one caller wins; the loser waits for the winner to
  // publish the subscription id instead of creating a second subscription.
  const claimer = `${Date.now()}-${crypto.randomUUID()}`;
  const { data: claimRows, error: claimErr } = await supabase
    .rpc("claim_pending_membership", { p_pending_id: pendingId, p_claimer: claimer });
  if (claimErr) throw new Error(`Pending membership claim failed: ${claimErr.message}`);

  const won = Array.isArray(claimRows) && claimRows.length > 0;
  if (!won) {
    const deadline = Date.now() + LOSER_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(LOSER_POLL_INTERVAL_MS);
      const publishedId = await readPendingSubscriptionId(pendingId);
      if (publishedId) {
        return ensureMembershipRecord({
          subscriptionId: publishedId,
          customerId,
          pendingId,
          sessionId,
          payload: { ...payload, stripe_subscription_id: publishedId },
          env,
          alreadyProcessed: true,
        });
      }
    }
    console.warn("[membership completion] loser timed out waiting for winner", pendingId);
    throw new MembershipCompletionInProgressError(pendingId);
  }

  const stripe = createStripeClient(env);
  const setupIntent = asRecord(await stripe.setupIntents.retrieve(setupIntentId));
  if (setupIntent.status !== "succeeded") {
    throw new Error(`SetupIntent ${setupIntentId} status is ${String(setupIntent.status || "unknown")}`);
  }

  const paymentMethodId = asString(setupIntent.payment_method);
  if (!paymentMethodId) throw new Error(`No payment_method on SetupIntent ${setupIntentId}`);

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  const stripePriceId = asString(payload.stripe_price_id);
  const stripeProductId = asString(payload.stripe_product_id);
  const firstChargeCents = asNumber(payload.first_charge_cents);
  const anchorUnix = asNumber(payload.billing_anchor_unix);
  if (!stripePriceId) throw new Error(`Missing Stripe price id for pending membership ${pendingId}`);
  if (!anchorUnix) throw new Error(`Missing billing anchor for pending membership ${pendingId}`);
  if (firstChargeCents > 0 && !stripeProductId) {
    throw new Error(`Missing Stripe product id for first charge on pending membership ${pendingId}`);
  }

  let subscriptionId: string | undefined;
  try {
    const subscription = asRecord(await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: stripePriceId }],
      default_payment_method: paymentMethodId,
      trial_end: anchorUnix,
      proration_behavior: "none",
      payment_behavior: "error_if_incomplete",
      metadata: { type: "membership", pending_membership_id: pendingId },
      ...(firstChargeCents > 0 && stripeProductId
        ? {
            add_invoice_items: [{
              price_data: {
                currency: "usd",
                product: stripeProductId,
                unit_amount: firstChargeCents,
              },
              quantity: 1,
            }],
          }
        : {}),
    }, {
      // Derived purely from the pending membership id. Nothing time-based and
      // nothing random, so a stale reclaim of a slow winner replays the same
      // key and Stripe returns the same subscription instead of a second one.
      idempotencyKey: `membership-sub-${pendingId}`,
    }));
    subscriptionId = asString(subscription.id);
  } catch (error) {
    console.error("[membership completion] subscription create failed", stripeErrorDetails(error));
    throw new Error(`Stripe subscription create failed: ${errorMessage(error)}`);
  }
  if (!subscriptionId) throw new Error("Stripe did not return a subscription id");

  // Conditional write: never overwrite a subscription id that is already stored.
  const { data: writeRows, error: writeErr } = await supabase
    .rpc("set_pending_membership_subscription", { p_id: pendingId, p_sub: subscriptionId });
  if (writeErr) throw new Error(`Pending membership update failed: ${writeErr.message}`);

  const writeRow = asRecord(Array.isArray(writeRows) ? writeRows[0] : writeRows);
  const storedSubscriptionId = asString(writeRow.stored_subscription_id) ?? subscriptionId;
  if (writeRow.written !== true && storedSubscriptionId !== subscriptionId) {
    console.warn(
      "[membership completion] subscription id already stored; reconciling onto stored id",
      { pendingId, stored: storedSubscriptionId, attempted: subscriptionId },
    );
  }

  return ensureMembershipRecord({
    subscriptionId: storedSubscriptionId,
    customerId,
    pendingId,
    sessionId,
    payload: { ...payload, stripe_subscription_id: storedSubscriptionId },
    env,
    alreadyProcessed: false,
  });

}

// A membership must never store a consent version the parent did not see.
function requireConsentVersion(payload: JsonObject): string {
  const version = asNullableString(payload.recurring_consent_version)
    || asNullableString(payload.membership_agreement_version);
  if (!version) {
    throw new Error("Missing recurring_consent_version on pending membership payload");
  }
  return version;
}

async function ensureMembershipRecord(options: {
  subscriptionId: string;
  customerId: string;
  pendingId: string;
  payload: JsonObject;
  env: StripeEnv;
  alreadyProcessed: boolean;
}): Promise<MembershipCompletionResult> {
  const { data: existing, error: existingErr } = await supabase
    .from("memberships")
    .select("id")
    .eq("stripe_subscription_id", options.subscriptionId)
    .maybeSingle();
  if (existingErr) throw new Error(`Membership lookup failed: ${existingErr.message}`);

  if (existing?.id) {
    const occurrenceCount = await ensureOccurrences(existing.id as string, options.payload);
    await sendWelcomeIfNeeded(existing.id as string, options.payload).catch((e) =>
      console.error("[membership completion] welcome send failed", errorMessage(e)),
    );
    return {
      membershipId: existing.id as string,
      subscriptionId: options.subscriptionId,
      occurrenceCount,
      firstChargeCents: asNumber(options.payload.first_charge_cents),
      monthlyCents: asNumber(options.payload.recurring_consent_amount_cents),
      alreadyProcessed: true,
    };
  }


  const stripe = createStripeClient(options.env);
  const subscription = asRecord(await stripe.subscriptions.retrieve(options.subscriptionId));
  const items = asRecord(subscription.items);
  const firstItem = asRecord(asArray(items.data)[0]);
  const periodStart = asNumber(firstItem.current_period_start) || asNumber(subscription.current_period_start);
  const periodEnd = asNumber(firstItem.current_period_end) || asNumber(subscription.current_period_end);
  const startDate = await resolveStartDate(options.payload);
  const smsConsent = asBoolean(options.payload.sms_consent);

  const { data: membership, error: insertErr } = await supabase
    .from("memberships")
    .insert({
      plan_key: asString(options.payload.plan_key),
      standing_slot_id: asString(options.payload.standing_slot_id),
      swim_level: asNullableString(options.payload.swim_level),
      child_first_name: asNullableString(options.payload.child_first_name),
      child_last_name: asNullableString(options.payload.child_last_name),
      child_dob: asNullableString(options.payload.child_dob),
      parent_first_name: asNullableString(options.payload.parent_first_name),
      parent_last_name: asNullableString(options.payload.parent_last_name),
      parent_email: asString(options.payload.parent_email),
      parent_phone: asNullableString(options.payload.parent_phone),
      is_first_time: options.payload.is_first_time === undefined ? null : asBoolean(options.payload.is_first_time),
      has_medical: options.payload.has_medical === undefined ? null : asBoolean(options.payload.has_medical),
      medical_notes: asNullableString(options.payload.medical_notes),
      notes: asNullableString(options.payload.notes),
      waiver_id: asNullableString(options.payload.waiver_id),
      status: "active",
      start_date: startDate,
      stripe_customer_id: options.customerId,
      stripe_subscription_id: options.subscriptionId,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      recurring_consent_at: new Date().toISOString(),
      recurring_consent_version: requireConsentVersion(options.payload),
      recurring_consent_amount_cents: asNumber(options.payload.recurring_consent_amount_cents) || null,
      membership_agreement_version: asNullableString(options.payload.membership_agreement_version),
      membership_agreement_text: asNullableString(options.payload.membership_agreement_text),
      membership_agreement_accepted_at: asBoolean(options.payload.membership_agreement_accepted)
        ? new Date().toISOString()
        : null,
      sms_consent: smsConsent,
      sms_consent_at: smsConsent ? new Date().toISOString() : null,
      sms_consent_text: asNullableString(options.payload.sms_consent_text),
      sms_consent_version: asNullableString(options.payload.sms_consent_version),
    })
    .select("id")
    .single();

  if (insertErr || !membership?.id) {
    throw new Error(`Membership insert failed: ${insertErr?.message || "no row returned"}`);
  }

  const occurrenceCount = await ensureOccurrences(membership.id as string, options.payload);
  console.log("[membership completion] membership created", membership.id, "pending", options.pendingId);
  await sendWelcomeIfNeeded(membership.id as string, options.payload).catch((e) =>
    console.error("[membership completion] welcome send failed", errorMessage(e)),
  );

  return {
    membershipId: membership.id as string,
    subscriptionId: options.subscriptionId,
    occurrenceCount,
    firstChargeCents: asNumber(options.payload.first_charge_cents),
    monthlyCents: asNumber(options.payload.recurring_consent_amount_cents),
    alreadyProcessed: options.alreadyProcessed,
  };
}

async function resolveStartDate(payload: JsonObject): Promise<string> {
  const explicit = asNullableString(payload.first_lesson_date);
  if (explicit) return explicit;

  const standingSlotId = asString(payload.standing_slot_id);
  if (!standingSlotId) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  const { data: slot } = await supabase
    .from("standing_slots")
    .select("day_of_week")
    .eq("id", standingSlotId)
    .maybeSingle();
  const dow = asNumber(slot?.day_of_week);
  const first = firstLessonDate(dow);
  return `${first.y}-${String(first.m).padStart(2, "0")}-${String(first.d).padStart(2, "0")}`;
}

async function ensureOccurrences(membershipId: string, payload: JsonObject): Promise<number> {
  const { count, error: countErr } = await supabase
    .from("membership_occurrences")
    .select("id", { count: "exact", head: true })
    .eq("membership_id", membershipId);
  if (countErr) throw new Error(`Membership occurrence lookup failed: ${countErr.message}`);
  if ((count ?? 0) > 0) return count ?? 0;

  const standingSlotId = asString(payload.standing_slot_id);
  if (!standingSlotId) throw new Error("Missing standing slot for membership occurrences");

  const { data: slot, error: slotErr } = await supabase
    .from("standing_slots")
    .select("day_of_week, start_time, end_time, instructor_id")
    .eq("id", standingSlotId)
    .maybeSingle();
  if (slotErr || !slot) throw new Error(`Standing slot lookup failed: ${slotErr?.message || "not found"}`);

  // Load closure dates so we skip weeks that fall on a studio closure.
  const closureDates = await fetchClosureDateSet();

  const rows = buildMembershipOccurrenceRows({
    membershipId,
    slot: {
      day_of_week: asNumber(slot.day_of_week),
      start_time: (slot.start_time as string | null) ?? null,
      end_time: (slot.end_time as string | null) ?? null,
      instructor_id: (slot.instructor_id as string | null) ?? null,
    },
    startISO: await resolveStartDate(payload),
    closureDates,
  });


  const { error: insertErr } = await supabase.from("membership_occurrences").insert(rows);
  if (insertErr) throw new Error(`Membership occurrence insert failed: ${insertErr.message}`);
  return rows.length;
}

const PLAN_NAMES: Record<string, string> = {
  kid_group: "Small Group Swim",
  private: "Private Swim",
  adult_group: "Adult Swim",
};

async function sendWelcomeIfNeeded(membershipId: string, payload: JsonObject): Promise<void> {
  // Idempotency: only send once per membership.
  const { data: current, error: readErr } = await supabase
    .from("memberships")
    .select("id, welcome_sent_at, parent_email, parent_phone, parent_first_name, child_first_name, plan_key, sms_consent, start_date, manage_token")
    .eq("id", membershipId)
    .maybeSingle();
  if (readErr) throw new Error(`Membership read failed: ${readErr.message}`);
  if (!current || current.welcome_sent_at) return;

  const { data: firstOcc } = await supabase
    .from("membership_occurrences")
    .select("occurrence_date, start_time")
    .eq("membership_id", membershipId)
    .order("occurrence_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  const occDate = (firstOcc?.occurrence_date as string | undefined) || (current.start_date as string | undefined) || "";
  const startTime = (firstOcc?.start_time as string | undefined) || "";
  const planName = PLAN_NAMES[String(current.plan_key)] || "swim";
  const swimmerName = asNullableString(current.child_first_name) || asNullableString(payload.child_first_name) || "your swimmer";
  const familyName = asNullableString(current.parent_first_name) || asNullableString(payload.parent_first_name) || undefined;
  const monthlyCents = asNumber(payload.recurring_consent_amount_cents);
  const monthlyPrice = monthlyCents > 0 ? `$${(monthlyCents / 100).toFixed(monthlyCents % 100 === 0 ? 0 : 2)}` : "";

  const weekday = occDate ? formatPTDate(occDate, { weekday: "long" }) : "";
  const monthDay = occDate ? formatPTDate(occDate, { month: "long", day: "numeric" }) : "";
  const longDate = occDate ? formatPTDate(occDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
  const prettyTime = formatPTTime(startTime);

  // 1) SMS via TextMagic — only when the parent consented and we have a phone.
  const phone = asNullableString(current.parent_phone) || asNullableString(payload.parent_phone);
  if (current.sms_consent === true && phone) {
    const message = `Welcome to Aquatic Dreams! ${swimmerName}'s first ${planName} lesson is ${weekday} ${monthDay}${prettyTime ? ` at ${prettyTime}` : ""}, 1212 Kansas Ave, Modesto, CA. See you there!`;
    const smsResult = await sendAndLogBookingConfirmation(supabase, {
      phoneRaw: phone,
      message,
      swimmer_name: swimmerName,
      reminder_kind: "membership_welcome",
    });
    if (!smsResult.ok && !smsResult.skipped) {
      console.error("[membership completion] welcome SMS failed", membershipId, smsResult.error);
    }
  }

  // 2) Email via send-transactional-email.
  const parentEmail = asNullableString(current.parent_email) || asNullableString(payload.parent_email);
  if (parentEmail) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          templateName: "membership-welcome",
          recipientEmail: parentEmail,
          idempotencyKey: `membership-welcome-${membershipId}`,
          purpose: "transactional",
          templateData: {
            familyName,
            swimmerName,
            programName: planName,
            firstLessonDate: longDate,
            classTime: prettyTime,
            monthlyPrice,
            closureSchedule: (await fetchClosureSchedule()).text,
            manageUrl: current.manage_token ? buildManageLink(String(current.manage_token)) : undefined,
          },

        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error("[membership completion] welcome email failed", res.status, body.slice(0, 300));
      }
    } catch (e) {
      console.error("[membership completion] welcome email threw", errorMessage(e));
    }
  }

  // Mark sent even if one channel failed — we log errors above; don't spam retries.
  const { error: updErr } = await supabase
    .from("memberships")
    .update({ welcome_sent_at: new Date().toISOString() })
    .eq("id", membershipId)
    .is("welcome_sent_at", null);
  if (updErr) console.error("[membership completion] welcome_sent_at update failed", updErr.message);
}
