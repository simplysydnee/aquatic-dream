// Creates lesson_bookings + lesson_booking_occurrences (pending),
// resolves/creates a Stripe Customer, returns an Embedded Checkout (setup mode) client_secret.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { getPrivateLessonPrice } from "../_shared/private-lesson-pricing.ts";
import {
  validateOccurrencesAgainstBlocks,
  formatAvailabilityError,
  type BookingBlock,
} from "../_shared/availability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SlotSchema = z.object({
  instructor_id: z.string().uuid(),
  slot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
});

const BodySchema = z.object({
  environment: z.enum(["sandbox", "live"]),
  session_token: z.string().min(8).max(128),
  parent_first_name: z.string().min(1).max(80),
  parent_last_name: z.string().min(1).max(80),
  parent_email: z.string().email(),
  parent_phone: z.string().max(40).optional().nullable(),
  child_first_name: z.string().min(1).max(80),
  child_last_name: z.string().min(1).max(80),
  child_age: z.number().int().min(1).max(99),
  notes: z.string().max(1000).optional().nullable(),
  sms_consent: z.boolean().optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
  reuse_token: z.string().min(8).max(128).optional(),
  slots: z.array(SlotSchema).min(1).max(40),
  agreement: z.object({
    waiver_accepted: z.boolean(),
    photo_release_accepted: z.boolean(),
    privacy_policy_accepted: z.boolean(),
    terms_accepted: z.boolean(),
    signature_text: z.string().min(1).max(120),
    emergency_contact_first_name: z.string().min(1).max(80),
    emergency_contact_last_name: z.string().min(1).max(80),
    emergency_contact_phone: z.string().min(1).max(40),
    emergency_contact_relationship: z.string().min(1).max(60),
  }),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let step = "start";
  try {
    step = "parse_body";
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return j({ error: parsed.error.flatten(), step }, 400);
    const body = parsed.data;

    // Idempotency replay: if this exact submission was already accepted, return
    // the original Checkout client_secret instead of creating a parallel
    // pending_card booking ("ghost booking" pattern from Freya/Valeria).
    if (body.idempotency_key) {
      try {
        const { data: prior } = await supabase
          .from("lesson_bookings")
          .select("id, stripe_customer_id, status")
          .eq("idempotency_key", body.idempotency_key)
          .maybeSingle();
        if (prior?.id) {
          // Reused booking branch (no checkout). Surface success without
          // creating duplicates.
          if ((prior as any).status === "active") {
            return j({ booking_id: prior.id, reused: true, idempotent: true });
          }
          // Pending booking — re-issue checkout session would require storing
          // it; safer to just acknowledge and let the client poll-confirm.
          return j({ booking_id: prior.id, idempotent: true, pending: true });
        }
      } catch (e) {
        console.warn("idempotency lookup failed (non-fatal)", e instanceof Error ? e.message : String(e));
      }
    }

    step = "validate_agreement";
    if (!body.agreement.waiver_accepted || !body.agreement.terms_accepted || !body.agreement.privacy_policy_accepted) {
      return j({ error: "Required agreements not accepted", step }, 400);
    }

    // Enforce one instructor per booking (UI also does this, but back it on the server too).
    step = "enforce_single_instructor";
    const uniqInstructors = [...new Set(body.slots.map((s) => s.instructor_id))];
    if (uniqInstructors.length > 1) {
      return j({ error: "All slots in a single booking must be with the same instructor.", step }, 400);
    }

    // Validate slots are still open: no conflicting occurrences (using EFFECTIVE
    // times so moved/rescheduled occurrences are accounted for).
    step = "check_slot_conflicts";
    const uniqDates = [...new Set(body.slots.map((s) => s.slot_date))];

    const { data: existing, error: existingErr } = await supabase
      .from("lesson_booking_occurrences")
      .select("occurrence_date, status, created_at, start_time_override, end_time_override, instructor_override_id, lesson_bookings!inner(instructor_id, start_time, end_time)")
      .in("occurrence_date", uniqDates)
      .neq("status", "cancelled");
    if (existingErr) throw existingErr;

    const STALE_MS = 30 * 60 * 1000;
    const nowMs = Date.now();
    const takenIntervals: { instructor_id: string; date: string; start: string; end: string }[] = [];
    for (const row of (existing as any[] | null) ?? []) {
      const lb = row.lesson_bookings;
      // Ignore stale pending_card holds (abandoned checkouts).
      if (row.status === "pending_card") {
        const created = row.created_at ? new Date(row.created_at).getTime() : 0;
        if (nowMs - created > STALE_MS) continue;
      }
      const instId = row.instructor_override_id || lb?.instructor_id;
      const startT = normalizeTime(row.start_time_override || lb?.start_time || "");
      const endT = normalizeTime(row.end_time_override || lb?.end_time || "");
      if (!instId || !startT || !endT) continue;
      takenIntervals.push({ instructor_id: instId, date: row.occurrence_date, start: startT, end: endT });
    }

    // NOTE: slot_holds are advisory-only (used to gray out the live picker).
    // We deliberately do NOT block booking on them — stale holds from a
    // refresh/retry would otherwise lock the same parent out for 10 min.

    const conflicts: string[] = [];
    for (const s of body.slots) {
      const sStart = normalizeTime(s.start_time);
      const sEnd = normalizeTime(s.end_time);
      const overlaps = takenIntervals.some((t) =>
        t.instructor_id === s.instructor_id &&
        t.date === s.slot_date &&
        sStart < t.end && sEnd > t.start
      );
      if (overlaps) conflicts.push(`${s.instructor_id}|${s.slot_date}|${sStart}`);
    }
    if (conflicts.length) return j({ error: "slots_taken", conflicts, step: "check_slot_conflicts" }, 409);

    // Reject slots that overlap an instructor blackout (closed) block.
    step = "check_blackouts";
    const instructorIds = [...new Set(body.slots.map((s) => s.instructor_id))];
    const { data: blocksData, error: blocksErr } = await supabase
      .rpc("get_public_booking_blocks", { _instructor_ids: instructorIds });
    if (blocksErr) throw blocksErr;
    const blackouts = ((blocksData as any[]) || []).filter((b) => b.is_blackout);
    const blackoutConflicts: string[] = [];
    for (const s of body.slots) {
      const d = new Date(s.slot_date + "T00:00:00");
      const dow = d.getDay();
      const sStart = normalizeTime(s.start_time);
      const sEnd = normalizeTime(s.end_time);
      const hit = blackouts.some((b) => {
        if (b.instructor_id !== s.instructor_id) return false;
        if (b.start_date && s.slot_date < b.start_date) return false;
        if (b.end_date && s.slot_date > b.end_date) return false;
        if (b.kind === "weekly" && b.day_of_week !== dow) return false;
        if (b.kind === "date_range" && b.day_of_week !== null && b.day_of_week !== dow) return false;
        const bStart = normalizeTime(b.start_time);
        const bEnd = normalizeTime(b.end_time);
        return sStart < bEnd && sEnd > bStart;
      });
      if (hit) blackoutConflicts.push(`${s.instructor_id}|${s.slot_date}|${sStart}`);
    }
    if (blackoutConflicts.length) {
      return j({ error: "slot_closed", conflicts: blackoutConflicts, step: "check_blackouts" }, 409);
    }

    // Availability guard: every requested slot must fall inside a
    // non-blackout instructor_booking_blocks window. Reuses the blocks
    // we just fetched for the blackout check.
    step = "check_availability";
    {
      const proposed = body.slots.map((s) => ({
        instructor_id: s.instructor_id,
        date: s.slot_date,
        start_time: s.start_time,
        end_time: s.end_time,
      }));
      const failures = validateOccurrencesAgainstBlocks(
        proposed,
        ((blocksData as any[]) || []) as BookingBlock[],
      );
      if (failures.length) {
        return j(
          {
            error: formatAvailabilityError(failures),
            code: "instructor_unavailable",
            failures,
            step: "check_availability",
          },
          422,
        );
      }
    }



    // Lookup instructor name (first slot used as primary on the booking row).
    step = "lookup_instructor";
    const { data: instructor } = await supabase
      .from("instructors").select("id, name").eq("id", body.slots[0].instructor_id).maybeSingle();
    const instructorName = (instructor as any)?.name ?? null;

    // Stripe customer
    step = "stripe_customer_lookup";
    const stripe = createStripeClient(body.environment as StripeEnv);
    const existingCustomers = await stripe.customers.list({ email: body.parent_email, limit: 1 });
    let customerId = existingCustomers.data[0]?.id;
    if (!customerId) {
      step = "stripe_customer_create";
      customerId = (await stripe.customers.create({
        email: body.parent_email,
        name: `${body.parent_first_name} ${body.parent_last_name}`,
        phone: body.parent_phone || undefined,
      })).id;
    }

    // ADDITIVE: optional reuse of a sibling card via short-lived reuse_token.
    // Any failure here MUST fall through silently to today's normal Setup
    // Checkout flow. The parent must never see a reuse-related error.
    let reuseInfo: { pmId: string; customerId: string; tokenRow: string } | null = null;
    if (body.reuse_token) {
      try {
        step = "reuse_token_resolve";
        const { data: tok } = await supabase
          .from("card_reuse_tokens")
          .select("token, parent_email, stripe_customer_id, stripe_payment_method_id, expires_at, consumed_at")
          .eq("token", body.reuse_token)
          .maybeSingle();
        if (
          tok &&
          !(tok as any).consumed_at &&
          new Date((tok as any).expires_at).getTime() > Date.now() &&
          ((tok as any).parent_email || "").toLowerCase() === body.parent_email.toLowerCase()
        ) {
          // Revalidate the PM is still attached + not expired before stamping.
          const pm = await stripe.paymentMethods.retrieve((tok as any).stripe_payment_method_id);
          const pmCust = typeof pm.customer === "string" ? pm.customer : pm.customer?.id ?? null;
          const expOk = pm.card
            ? !(pm.card.exp_year < new Date().getUTCFullYear() ||
                (pm.card.exp_year === new Date().getUTCFullYear() && pm.card.exp_month < new Date().getUTCMonth() + 1))
            : false;
          if (pm.type === "card" && pmCust && expOk) {
            reuseInfo = {
              pmId: (tok as any).stripe_payment_method_id,
              customerId: pmCust,
              tokenRow: (tok as any).token,
            };
            customerId = pmCust;
          }
        }
      } catch (e) {
        console.warn(
          "reuse_token branch failed — falling through to Setup Checkout",
          e instanceof Error ? e.message : String(e),
        );
        reuseInfo = null;
      }
    }

    // Pick canonical start time = earliest, end = latest? For series we just stamp first slot.
    const sorted = [...body.slots].sort((a, b) => (a.slot_date + a.start_time).localeCompare(b.slot_date + b.start_time));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const bookingId = crypto.randomUUID();
    const parentName = `${body.parent_first_name} ${body.parent_last_name}`;
    const childName = `${body.child_first_name} ${body.child_last_name}`;

    // Create Stripe Checkout session FIRST (only if NOT reusing a saved card)
    // so a Stripe failure doesn't leave orphan pending_card rows in the DB
    // that would later be miscounted as taken slots.
    let session: { id: string; client_secret: string | null } | null = null;
    if (!reuseInfo) {
      step = "stripe_checkout_session_create";
      session = await stripe.checkout.sessions.create({
        mode: "setup",
        ui_mode: "embedded_page",
        customer: customerId,
        currency: "usd",
        payment_method_types: ["card"],
        redirect_on_completion: "never",
        metadata: { booking_id: bookingId, type: "private_lesson_card_on_file" },
      });
    }

    step = "insert_lesson_booking";
    const smsConsent = body.sms_consent === true;
    const clientIp = (req.headers.get("x-forwarded-for") || "")
      .split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || null;
    const SMS_CONSENT_VERSION = "2026-06-08";
    const SMS_CONSENT_TEXT =
      "I agree to receive SMS text messages from Aquatic Dreams Swim Modesto " +
      "about my swimmer's lessons, schedule changes, reminders, and account " +
      "updates at the phone number I provided. Message frequency varies. " +
      "Message and data rates may apply. Reply STOP to unsubscribe or HELP for help. " +
      "See our SMS Terms (/sms-terms) and Privacy Policy (/waivers). " +
      "Consent is not a condition of enrollment.";

    const bookingStatus = reuseInfo ? "active" : "pending_card";
    const { error: bErr } = await supabase.from("lesson_bookings").insert({
      id: bookingId,
      lesson_type: "private",
      parent_name: parentName,
      parent_first_name: body.parent_first_name,
      parent_last_name: body.parent_last_name,
      parent_email: body.parent_email,
      parent_phone: body.parent_phone,
      child_name: childName,
      child_first_name: body.child_first_name,
      child_last_name: body.child_last_name,
      child_age: body.child_age,
      price_per_session: getPrivateLessonPrice("private", first.slot_date),
      instructor_name: instructorName,
      instructor_id: body.slots[0].instructor_id,
      pool_area: "shallow",
      start_time: first.start_time,
      end_time: first.end_time,
      recurring: body.slots.length > 1,
      series_start: first.slot_date,
      series_end: last.slot_date,
      notes: body.notes ?? null,
      status: bookingStatus,
      booking_source: "self_serve",
      waiver_signed_at: body.agreement.waiver_accepted ? new Date().toISOString() : null,
      stripe_customer_id: customerId,
      stripe_payment_method_id: reuseInfo?.pmId ?? null,
      idempotency_key: body.idempotency_key ?? null,
      cancellation_policy_hours: 24,
      sms_consent: smsConsent,
      sms_consent_at: smsConsent ? new Date().toISOString() : null,
      sms_consent_ip: smsConsent ? clientIp : null,
      sms_consent_version: smsConsent ? SMS_CONSENT_VERSION : null,
      sms_consent_text: smsConsent ? SMS_CONSENT_TEXT : null,
    });
    if (bErr) throw bErr;

    step = "insert_occurrences";
    const occStatus = reuseInfo ? "scheduled" : "pending_card";
    const occurrences = body.slots.map((s) => ({
      id: crypto.randomUUID(),
      booking_id: bookingId,
      occurrence_date: s.slot_date,
      payment_status: "card_on_file",
      charge_status: "pending",
      status: occStatus,
      cancel_token: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""),
    }));
    const { error: oErr } = await supabase.from("lesson_booking_occurrences").insert(occurrences);
    if (oErr) throw oErr;

    // Mark the reuse token consumed (best-effort).
    if (reuseInfo) {
      try {
        await supabase
          .from("card_reuse_tokens")
          .update({ consumed_at: new Date().toISOString() })
          .eq("token", reuseInfo.tokenRow);
      } catch (e) {
        console.warn("reuse token consume failed (non-fatal)", e instanceof Error ? e.message : String(e));
      }
    }

    // Claim the slots: remove any slot_holds (from this or any other
    // session) that cover the booked instructor/date/time so subsequent
    // bookings aren't blocked by ghost holds.
    step = "cleanup_slot_holds";
    try {
      await Promise.all(body.slots.map((s) =>
        supabase.from("slot_holds")
          .delete()
          .eq("instructor_id", s.instructor_id)
          .eq("slot_date", s.slot_date)
          .eq("start_time", s.start_time)
      ));
    } catch (cleanupErr) {
      console.error("slot_holds cleanup failed (non-fatal)", (cleanupErr as any)?.message);
    }

    step = "insert_agreement";
    const { error: aErr } = await supabase.from("enrollment_agreements").insert({
      lesson_booking_id: bookingId,
      signer_first_name: body.parent_first_name,
      signer_last_name: body.parent_last_name,
      signer_name: parentName,
      signer_email: body.parent_email,
      signer_ip: req.headers.get("x-forwarded-for") || null,
      waiver_accepted: body.agreement.waiver_accepted,
      photo_release_accepted: body.agreement.photo_release_accepted,
      privacy_policy_accepted: body.agreement.privacy_policy_accepted,
      terms_accepted: body.agreement.terms_accepted,
      signature_text: body.agreement.signature_text,
      emergency_contact_first_name: body.agreement.emergency_contact_first_name,
      emergency_contact_last_name: body.agreement.emergency_contact_last_name,
      emergency_contact_name: `${body.agreement.emergency_contact_first_name} ${body.agreement.emergency_contact_last_name}`,
      emergency_contact_phone: body.agreement.emergency_contact_phone,
      emergency_contact_relationship: body.agreement.emergency_contact_relationship,
    });
    if (aErr) console.error("agreement insert failed (non-fatal)", aErr?.message);

    if (reuseInfo) {
      // Fire confirmation just like confirm-private-booking would on the
      // Setup Checkout path. Best-effort, never blocks the response.
      try {
        const { sendPrivateBookingConfirmation } = await import("../_shared/send-private-booking-confirmation.ts");
        await sendPrivateBookingConfirmation(supabase, bookingId, { mode: "initial" });
      } catch (e) {
        console.error("reuse-path confirmation send failed (non-fatal)", e instanceof Error ? e.message : String(e));
      }
      return j({ booking_id: bookingId, reused: true });
    }

    return j({
      booking_id: bookingId,
      client_secret: session!.client_secret,
      checkout_session_id: session!.id,
      customer_id: customerId,
    });
  } catch (err: any) {
    console.error("create-private-booking-setup error", {
      step,
      message: err?.message,
      code: err?.code,
      type: err?.type,
      stack: err?.stack,
    });
    return j({ error: err?.message || "Internal error", step, code: err?.code, type: err?.type }, 500);
  }
});

function normalizeTime(t: string): string {
  return t.length >= 8 ? t.substring(0, 5) : t;
}

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
