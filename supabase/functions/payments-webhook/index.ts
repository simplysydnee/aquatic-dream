import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { type StripeEnv, createStripeClient, verifyWebhook } from "../_shared/stripe.ts";
import { sendEnrollmentConfirmation as sendConfirmationHelper } from "../_shared/send-enrollment-confirmation.ts";
import { sendAndLogBookingConfirmation, formatPTTime, formatPTDate } from "../_shared/textmagic.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface ChildPayload {
  level: string;
  childName: string;
  childFirstName?: string;
  childLastName?: string;
  childAge: number;
  childDob: string | null;
  sessionIds: string[];
  isFirstTime: boolean;
  /** First-timers only: when true, full session fee was charged at checkout. */
  payAhead?: boolean;
  parentName: string;
  parentFirstName?: string;
  parentLastName?: string;
  parentEmail: string;
  parentPhone: string | null;
  medicalNotes: string | null;
  notes: string | null;
  agreement: {
    waiverAccepted: boolean;
    photoReleaseAccepted: boolean;
    privacyPolicyAccepted: boolean;
    termsAccepted: boolean;
    signatureText: string;
    emergencyContactName: string;
    emergencyContactFirstName?: string;
    emergencyContactLastName?: string;
    emergencyContactPhone: string;
    emergencyContactRelationship: string;
  };
}

interface CheckoutPayload {
  children: ChildPayload[];
  signerIp: string | null;
  versions: { waiver: string; tos: string; privacy: string };
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const env = (url.searchParams.get("env") || "sandbox") as StripeEnv;

  try {
    const event = await verifyWebhook(req, env);
    console.log("Received event:", event.type, "env:", env);

    switch (event.type) {
      case "checkout.session.completed": {
        const obj = event.data.object;
        if (obj?.metadata?.type === "membership") {
          await handleMembershipCheckoutCompleted(obj, env);
        } else if (obj?.metadata?.type === "registration_fee" && obj?.metadata?.enrollmentId) {
          await handleRegistrationFeePaid(obj);
        } else if (obj?.metadata?.type === "session_fee" && obj?.metadata?.enrollmentId) {
          await handleSessionFeePaid(obj);
        } else if (obj?.metadata?.type === "admin_phone_checkout" && obj?.metadata?.enrollmentId) {
          await handleAdminPhoneCheckoutPaid(obj);
        } else if (obj?.metadata?.type === "lesson_booking_occurrence" && obj?.metadata?.occurrenceId) {
          await handleLessonBookingPaid(obj);
        } else if (obj?.metadata?.type === "lesson_booking_series" && obj?.metadata?.bookingId) {
          await handleLessonSeriesPaid(obj);
        } else {
          await handleCheckoutCompleted(obj);
        }
        break;
      }
      default:
        console.log("Unhandled event:", event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("Webhook error", { status: 400 });
  }
});

async function handleCheckoutCompleted(session: any) {
  const sessionId: string = session.id;

  // 1. IDEMPOTENCY: if any enrollment already references this Stripe session, do nothing.
  const { data: existing } = await supabase
    .from("swim_enrollments")
    .select("id")
    .eq("stripe_payment_id", sessionId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    console.log("Webhook already processed for session:", sessionId);
    return;
  }

  const pendingId: string | undefined = session.metadata?.pendingEnrollmentId;
  if (!pendingId) {
    console.warn("No pendingEnrollmentId in metadata; skipping.");
    return;
  }

  // 2. Fetch staged payload
  const { data: pending, error: pendingErr } = await supabase
    .from("pending_enrollments")
    .select("payload")
    .eq("id", pendingId)
    .maybeSingle();

  if (pendingErr || !pending) {
    console.error("Pending enrollment not found:", pendingId, pendingErr);
    return;
  }

  const payload = pending.payload as CheckoutPayload;

  // 3. Fetch session details for prices/dates
  const allSessionIds = [...new Set(payload.children.flatMap((c) => c.sessionIds))];
  const { data: sessions } = await supabase
    .from("swim_sessions")
    .select("id, session_price, session_start_date")
    .in("id", allSessionIds);

  const sessionMap = Object.fromEntries((sessions || []).map((s) => [s.id, s]));

  // 4. Re-check capacity (best effort — never reject a paid customer; log warning if over)
  const { data: existingEnrollments } = await supabase
    .from("swim_enrollments")
    .select("session_id")
    .in("session_id", allSessionIds)
    .eq("status", "confirmed");

  const countMap: Record<string, number> = {};
  existingEnrollments?.forEach((e) => {
    if (e.session_id) countMap[e.session_id] = (countMap[e.session_id] || 0) + 1;
  });
  for (const sid of allSessionIds) {
    const used = countMap[sid] || 0;
    const wanted = payload.children.filter((c) => c.sessionIds.includes(sid)).length;
    const s = sessionMap[sid];
    if (s && used + wanted > 3) {
      console.warn(`Capacity exceeded for session ${sid} after payment — admin review needed (used=${used}, wanted=${wanted})`);
    }
  }

  // 5. Build atomic enrollment rows — payment_amount reflects what Stripe ACTUALLY charged for that row.
  //    First-time: $45 reg fee charged on row 0; session fee NOT charged (due day 1, payment_status='unpaid' for session fee tracking).
  //    Returning: full session fee charged per row.
  //
  //    We sanity-check the per-row total against session.amount_total so we never claim more was paid
  //    than Stripe actually collected.
  const stripeAmountTotalCents = Number(session.amount_total || 0);
  const stripeAmountTotal = stripeAmountTotalCents / 100;

  const enrollmentRows = payload.children.flatMap((child) => {
    return child.sessionIds.map((sid, i) => {
      const s = sessionMap[sid];
      const sessionPrice = Number(s?.session_price ?? 240);
      const chargeRegFee = child.isFirstTime && i === 0;
      const regFee = chargeRegFee ? 45 : 0;

      // payment_status tracks the REGISTRATION FEE only.
      // session_fee_status tracks the $240 session fee SEPARATELY.
      //   - Returning: Stripe collected $240 at checkout → session_fee_status='paid'
      //   - First-time, payAhead=true: Stripe also collected the session fee → 'paid'
      //   - First-time, default: only $45 reg fee charged → 'due_day_1'
      const isReturning = !child.isFirstTime;
      const sessionFeePaidAtCheckout = isReturning || (child.isFirstTime && child.payAhead === true);

      // payment_amount = what Stripe charged for THIS row.
      //   returning: sessionPrice
      //   first-time payAhead: regFee (on row 0) + sessionPrice
      //   first-time default: regFee (on row 0) only
      const paymentAmount =
        (isReturning ? sessionPrice : 0) +
        (chargeRegFee ? regFee : 0) +
        (child.isFirstTime && child.payAhead ? sessionPrice : 0);

      // Reg fee is one-time per family. First-timer's first row pays it; additional
      // rows (same checkout, same family) get 'not_required' — same as returning swimmers.
      const rowPaymentStatus = isReturning ? "not_required" : (chargeRegFee ? "paid" : "not_required");
      const sessionFeeStatus = sessionFeePaidAtCheckout ? "paid" : "due_day_1";

      return {
        swim_level: child.level,
        session_id: sid,
        parent_name: child.parentName,
        parent_first_name: child.parentFirstName ?? null,
        parent_last_name: child.parentLastName ?? null,
        parent_email: child.parentEmail,
        parent_phone: child.parentPhone,
        child_name: child.childName,
        child_first_name: child.childFirstName ?? null,
        child_last_name: child.childLastName ?? null,
        child_age: child.childAge,
        child_dob: child.childDob,
        medical_notes: child.medicalNotes,
        notes: child.notes,
        lesson_type: "group",
        registration_fee: regFee,
        status: "confirmed",
        payment_status: rowPaymentStatus,
        payment_amount: paymentAmount,
        is_first_time: child.isFirstTime,
        payment_due_date: s?.session_start_date || null,
        stripe_payment_id: sessionId,
        payment_method: "stripe",
        payment_reference: sessionId,
        session_fee_status: sessionFeeStatus,
        session_fee_stripe_id: sessionFeePaidAtCheckout ? sessionId : null,
        session_fee_paid_at: sessionFeePaidAtCheckout ? new Date().toISOString() : null,
      };
    });
  });

  // Two-way reconciliation: flag both undercharges (Stripe < expected) AND
  // overcharges (Stripe > expected). Customer already paid; never block insert.
  const computedTotal = enrollmentRows.reduce((sum, r) => sum + Number(r.payment_amount || 0), 0);
  const delta = Math.round((stripeAmountTotal - computedTotal) * 100) / 100;
  const hasMismatch = stripeAmountTotal > 0 && Math.abs(delta) > 0.01;
  const direction: "overcharge" | "undercharge" | null = hasMismatch
    ? (delta > 0 ? "overcharge" : "undercharge")
    : null;
  if (hasMismatch) {
    const tag = direction === "overcharge" ? "RECONCILIATION_OVERCHARGE" : "RECONCILIATION_UNDERCHARGE";
    console.error(
      `${tag} for session ${sessionId}: Stripe=$${stripeAmountTotal} expected=$${computedTotal} delta=$${delta}`
    );
  } else {
    console.log(`Reconciliation OK: Stripe=$${stripeAmountTotal} rows=$${computedTotal}`);
  }

  const { data: insertedEnrollments, error: enrollErr } = await supabase
    .from("swim_enrollments")
    .insert(enrollmentRows)
    .select("id");

  if (enrollErr || !insertedEnrollments) {
    console.error("Atomic enrollment insert failed:", enrollErr);
    throw new Error(`Enrollment insert failed: ${enrollErr?.message}`);
  }

  console.log(`Inserted ${insertedEnrollments.length} enrollments for session ${sessionId}`);

  // Persist reconciliation alert with enrollment IDs (non-blocking).
  if (hasMismatch && direction) {
    try {
      await supabase.from("payment_reconciliation_alerts").insert({
        stripe_checkout_session_id: sessionId,
        expected_amount: computedTotal,
        actual_amount: stripeAmountTotal,
        delta: Math.abs(delta),
        direction,
        enrollment_ids: insertedEnrollments.map((e) => e.id),
        customer_email: payload.children[0]?.parentEmail || null,
      });
    } catch (alertErr) {
      console.error("Failed to insert reconciliation alert:", alertErr);
    }
  }

  // 6. Build agreement rows mapped to enrollment IDs (one agreement per enrollment row)
  let idx = 0;
  const agreementRows = payload.children.flatMap((child) => {
    return child.sessionIds.map(() => {
      const enrollId = insertedEnrollments[idx++].id;
      return {
        enrollment_id: enrollId,
        waiver_accepted: child.agreement.waiverAccepted,
        photo_release_accepted: child.agreement.photoReleaseAccepted,
        privacy_policy_accepted: child.agreement.privacyPolicyAccepted,
        terms_accepted: child.agreement.termsAccepted,
        signature_text: child.agreement.signatureText,
        signer_name: child.parentName,
        signer_first_name: child.parentFirstName ?? null,
        signer_last_name: child.parentLastName ?? null,
        signer_email: child.parentEmail,
        signer_ip: payload.signerIp,
        waiver_version: payload.versions.waiver,
        tos_version: payload.versions.tos,
        privacy_policy_version: payload.versions.privacy,
        emergency_contact_name: child.agreement.emergencyContactName,
        emergency_contact_first_name: child.agreement.emergencyContactFirstName ?? null,
        emergency_contact_last_name: child.agreement.emergencyContactLastName ?? null,
        emergency_contact_phone: child.agreement.emergencyContactPhone,
        emergency_contact_relationship: child.agreement.emergencyContactRelationship,
      };
    });
  });

  const { error: agreementErr } = await supabase
    .from("enrollment_agreements")
    .insert(agreementRows);

  if (agreementErr) {
    console.error("Agreement insert failed (enrollments succeeded):", agreementErr);
    // Do not throw — enrollments are recorded. Admin can backfill agreements if needed.
  }

  // 7. Cleanup staged payload
  await supabase.from("pending_enrollments").delete().eq("id", pendingId);

  // 8. Send confirmation emails (one per enrollment row)
  for (const e of insertedEnrollments) {
    await sendEnrollmentConfirmation(e.id);
  }

  // 8b. Send booking confirmation SMS (one per enrollment row, best-effort).
  try {
    console.log("[sms] payments-webhook block start, enrollments:", insertedEnrollments.length);
    const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dowIndex = (d: string | null | undefined): number => {
      if (!d) return 99;
      const i = WEEKDAYS.findIndex((w) => w.toLowerCase() === d.toLowerCase());
      return i >= 0 ? i : 99;
    };
    const joinDays = (days: string[]): string => {
      if (days.length === 0) return "";
      if (days.length === 1) return days[0];
      if (days.length === 2) return `${days[0]} and ${days[1]}`;
      return `${days.slice(0, -1).join(", ")}, and ${days[days.length - 1]}`;
    };
    for (const e of insertedEnrollments) {
      try {
        console.log("[sms] payments-webhook enrollment", e.id);
        const { data: enr } = await supabase
          .from("swim_enrollments")
          .select("id, parent_phone, child_first_name, child_name, session_id")
          .eq("id", e.id)
          .maybeSingle();
        if (!enr) { console.log("[sms] payments-webhook skip — no enrollment row", e.id); continue; }
        const sessionId = (enr as any).session_id as string | null;
        let sess: any = null;
        if (sessionId) {
          const { data } = await supabase
            .from("swim_sessions")
            .select("session_name, day_of_week, start_time, session_start_date, session_period_id, swim_level")
            .eq("id", sessionId)
            .maybeSingle();
          sess = data;
        }
        let period: any = null;
        if (sess?.session_period_id) {
          const { data } = await supabase
            .from("session_periods")
            .select("name, start_date, end_date")
            .eq("id", sess.session_period_id)
            .maybeSingle();
          period = data;
        }
        let days: string[] = sess?.day_of_week ? [sess.day_of_week] : [];
        if (sess?.session_period_id && sess?.swim_level && sess?.start_time) {
          const { data: siblings } = await supabase
            .from("swim_sessions")
            .select("day_of_week")
            .eq("session_period_id", sess.session_period_id)
            .eq("swim_level", sess.swim_level)
            .eq("start_time", sess.start_time)
            .eq("is_active", true);
          if (siblings && siblings.length > 0) {
            const uniq = Array.from(new Set((siblings as any[]).map((r) => r.day_of_week).filter(Boolean)));
            uniq.sort((a, b) => dowIndex(a) - dowIndex(b));
            if (uniq.length) days = uniq;
          }
        }
        const swimmerFirst = (enr as any).child_first_name || ((enr as any).child_name || "").split(" ")[0] || "Your swimmer";
        const sessionName = period?.name || sess?.session_name || "Swim Session";
        const timeLabel = formatPTTime(sess?.start_time);
        const daysLabel = joinDays(days);
        const startDateLabel = period?.start_date
          ? formatPTDate(period.start_date, { month: "short", day: "numeric" })
          : (sess?.session_start_date ? formatPTDate(sess.session_start_date, { month: "short", day: "numeric" }) : "");
        const endDateLabel = period?.end_date
          ? formatPTDate(period.end_date, { month: "short", day: "numeric" })
          : "";
        let message: string;
        if (startDateLabel && endDateLabel) {
          message = `${swimmerFirst} is enrolled in ${sessionName}! Classes run ${startDateLabel} to ${endDateLabel}, every ${daysLabel} at ${timeLabel} at Aquatic Dreams. See you there!`;
        } else if (startDateLabel) {
          message = `${swimmerFirst} is enrolled in ${sessionName}! Classes start ${startDateLabel}, every ${daysLabel} at ${timeLabel} at Aquatic Dreams. See you there!`;
        } else {
          message = `${swimmerFirst} is enrolled in ${sessionName}! Classes every ${daysLabel} at ${timeLabel} at Aquatic Dreams. See you there!`;
        }
        const result = await sendAndLogBookingConfirmation(supabase, {
          phoneRaw: (enr as any).parent_phone,
          message,
          swimmer_name: swimmerFirst,
          enrollment_id: e.id,
          reminder_kind: "booking_confirmation",
        });
        console.log("[sms] payments-webhook enrollment result", e.id, JSON.stringify(result));
      } catch (perEnrErr) {
        console.error("Enrollment SMS failed for", e.id, perEnrErr instanceof Error ? perEnrErr.message : String(perEnrErr));
      }
    }
  } catch (smsErr) {
    console.error("payments-webhook SMS block failed:", smsErr instanceof Error ? smsErr.message : String(smsErr));
  }

  // 9. Sync parent contact into the matching Resend audiences (fire-and-forget)
  for (const e of insertedEnrollments) {
    supabase.functions.invoke("resend-sync-enrollment-contact", {
      body: { enrollmentId: e.id },
    }).catch((err) => console.error("resend-sync-enrollment-contact failed:", err));
  }
}

async function handleRegistrationFeePaid(checkoutSession: any) {
  const enrollmentId = checkoutSession.metadata?.enrollmentId;
  if (!enrollmentId) {
    console.warn("Registration fee callback missing enrollmentId");
    return;
  }
  // Only mark paid when Stripe says it actually was, AND we have a real PI.
  if (checkoutSession.payment_status !== "paid" || !checkoutSession.payment_intent) {
    console.warn("Reg fee webhook ignored — not paid or missing PI:", {
      enrollmentId,
      payment_status: checkoutSession.payment_status,
      has_pi: !!checkoutSession.payment_intent,
    });
    return;
  }
  const stripeId = checkoutSession.payment_intent;
  const { error } = await supabase
    .from("swim_enrollments")
    .update({
      payment_status: "paid",
      payment_method: "stripe",
      payment_reference: stripeId,
      stripe_payment_id: stripeId,
      // Promote pending_payment reservations to confirmed once Stripe collects.
      status: "confirmed",
    })
    .eq("id", enrollmentId);
  if (error) {
    console.error("Failed to mark registration fee paid:", enrollmentId, error);
  } else {
    console.log("Registration fee marked paid for enrollment:", enrollmentId);
  }
}

async function handleSessionFeePaid(checkoutSession: any) {
  const enrollmentId = checkoutSession.metadata?.enrollmentId;
  if (!enrollmentId) {
    console.warn("Session fee callback missing enrollmentId");
    return;
  }
  const stripeId = checkoutSession.payment_intent || checkoutSession.id;
  const { error } = await supabase
    .from("swim_enrollments")
    .update({
      session_fee_status: "paid",
      session_fee_stripe_id: stripeId,
      session_fee_paid_at: new Date().toISOString(),
      // Returning-swimmer fallback rows are pending_payment until session fee is collected.
      status: "confirmed",
    })
    .eq("id", enrollmentId);
  if (error) {
    console.error("Failed to mark session fee paid:", enrollmentId, error);
  } else {
    console.log("Session fee marked paid for enrollment:", enrollmentId);
  }
}


async function handleAdminPhoneCheckoutPaid(checkoutSession: any) {
  const enrollmentId = checkoutSession.metadata?.enrollmentId;
  if (!enrollmentId) {
    console.warn("Admin phone checkout callback missing enrollmentId");
    return;
  }
  if (checkoutSession.payment_status !== "paid" || !checkoutSession.payment_intent) {
    console.warn("Admin phone checkout webhook ignored — not paid or missing PI:", {
      enrollmentId,
      payment_status: checkoutSession.payment_status,
      has_pi: !!checkoutSession.payment_intent,
    });
    return;
  }
  const stripeId = checkoutSession.payment_intent;
  const amountTotal = Number(checkoutSession.amount_total || 0);
  const coversSessionFee = amountTotal >= 24000;
  const update: Record<string, unknown> = {
    payment_status: "paid",
    payment_method: "stripe",
    payment_reference: stripeId,
    stripe_payment_id: stripeId,
  };
  if (coversSessionFee) {
    update.session_fee_status = "paid";
    update.session_fee_stripe_id = stripeId;
    update.session_fee_paid_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from("swim_enrollments")
    .update(update)
    .eq("id", enrollmentId);
  if (error) {
    console.error("Failed to mark admin phone checkout paid:", enrollmentId, error);
  } else {
    console.log("Admin phone checkout marked paid for enrollment:", enrollmentId, "amount:", amountTotal);
  }
}
async function handleLessonBookingPaid(checkoutSession: any) {
  const occurrenceId = checkoutSession.metadata?.occurrenceId;
  if (!occurrenceId) {
    console.warn("Lesson booking callback missing occurrenceId");
    return;
  }
  // Only mark paid when Stripe says it actually was, AND we have a real PI.
  if (checkoutSession.payment_status !== "paid" || !checkoutSession.payment_intent) {
    console.warn("Lesson booking webhook ignored — not paid or missing PI:", {
      occurrenceId,
      payment_status: checkoutSession.payment_status,
      has_pi: !!checkoutSession.payment_intent,
    });
    return;
  }
  const stripeId = checkoutSession.payment_intent;
  const { error } = await supabase
    .from("lesson_booking_occurrences")
    .update({
      payment_status: "paid",
      stripe_session_id: stripeId,
      payment_method: "stripe",
      payment_reference: stripeId,
      paid_at: new Date().toISOString(),
    })
    .eq("id", occurrenceId);
  if (error) {
    console.error("Failed to mark lesson occurrence paid:", occurrenceId, error);
  } else {
    console.log("Lesson occurrence marked paid:", occurrenceId);
  }
}

async function handleLessonSeriesPaid(checkoutSession: any) {
  const bookingId = checkoutSession.metadata?.bookingId;
  if (!bookingId) {
    console.warn("Lesson series callback missing bookingId");
    return;
  }
  if (checkoutSession.payment_status !== "paid" || !checkoutSession.payment_intent) {
    console.warn("Lesson series webhook ignored — not paid or missing PI:", {
      bookingId,
      payment_status: checkoutSession.payment_status,
      has_pi: !!checkoutSession.payment_intent,
    });
    return;
  }
  const stripeId = checkoutSession.payment_intent;
  // Mark all unpaid occurrences for this booking as paid
  const { data: occs, error: fetchErr } = await supabase
    .from("lesson_booking_occurrences")
    .select("id, payment_status")
    .eq("booking_id", bookingId);
  if (fetchErr) {
    console.error("Failed to load occurrences for series:", bookingId, fetchErr);
    return;
  }
  const toUpdate = (occs || []).filter((o: any) => o.payment_status !== "paid").map((o: any) => o.id);
  if (toUpdate.length === 0) {
    console.log("Series already fully paid:", bookingId);
    return;
  }
  const { error } = await supabase
    .from("lesson_booking_occurrences")
    .update({
      payment_status: "paid",
      stripe_session_id: stripeId,
      payment_method: "stripe",
      payment_reference: stripeId,
      paid_at: new Date().toISOString(),
    })
    .in("id", toUpdate);
  if (error) {
    console.error("Failed to mark series paid:", bookingId, error);
  } else {
    console.log(`Series marked paid: ${bookingId} (${toUpdate.length} occurrences)`);
  }
}

async function sendEnrollmentConfirmation(enrollmentId: string) {
  try {
    const res = await sendConfirmationHelper(supabase, enrollmentId);
    if (!res.ok) {
      console.error("Failed to send confirmation email:", res.error);
    } else {
      console.log("Enrollment confirmation email sent for:", enrollmentId);
    }
  } catch (err) {
    console.error("Failed to send confirmation email:", err);
  }
}

// ---------------- Membership (Phase 3b) ----------------

async function handleMembershipCheckoutCompleted(session: any, env: StripeEnv) {
  const subscriptionId: string | undefined = session.subscription;
  if (!subscriptionId) {
    console.error("[membership webhook] no subscription on session", session.id);
    return;
  }

  // Idempotency on subscription id.
  const { data: existing } = await supabase
    .from("memberships")
    .select("id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (existing) {
    console.log("[membership webhook] already processed", subscriptionId);
    return;
  }

  const md = session.metadata || {};
  const pendingId: string | undefined = md.pending_membership_id;
  let payload: Record<string, any> = {};
  if (pendingId) {
    const { data: pend, error: pendErr } = await supabase
      .from("pending_memberships")
      .select("payload")
      .eq("id", pendingId)
      .maybeSingle();
    if (pendErr || !pend) {
      console.error("[membership webhook] pending row missing", pendingId, pendErr);
    } else {
      payload = (pend.payload as Record<string, any>) || {};
    }
  } else {
    // Legacy fallback (pre-3g checkouts embedded fields directly in metadata).
    payload = {
      plan_key: md.plan_key,
      standing_slot_id: md.standing_slot_id,
      child_first_name: md.child_first_name,
      child_last_name: md.child_last_name,
      parent_name: md.parent_name,
      parent_email: md.parent_email,
      parent_phone: md.parent_phone,
      sms_consent: md.sms_consent === "1",
      recurring_consent_amount_cents: parseInt(md.recurring_consent_amount_cents || "0", 10) || null,
    };
  }

  const stripe = createStripeClient(env);
  let currentPeriodStart: string | null = null;
  let currentPeriodEnd: string | null = null;
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const item = (sub as any).items?.data?.[0];
    const start = item?.current_period_start ?? (sub as any).current_period_start;
    const end = item?.current_period_end ?? (sub as any).current_period_end;
    if (start) currentPeriodStart = new Date(start * 1000).toISOString();
    if (end) currentPeriodEnd = new Date(end * 1000).toISOString();
  } catch (e) {
    console.error("[membership webhook] could not load subscription", e);
  }

  const todayPT = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const smsConsent = payload.sms_consent === true;

  const { data: newMembership, error: insErr } = await supabase
    .from("memberships")
    .insert({
      plan_key: payload.plan_key,
      standing_slot_id: payload.standing_slot_id,
      child_first_name: payload.child_first_name || null,
      child_last_name: payload.child_last_name || null,
      child_dob: payload.child_dob || null,
      parent_first_name: payload.parent_first_name || null,
      parent_last_name: payload.parent_last_name || null,
      parent_email: payload.parent_email,
      parent_phone: payload.parent_phone || null,
      is_first_time: payload.is_first_time ?? null,
      has_medical: payload.has_medical ?? null,
      medical_notes: payload.medical_notes || null,
      notes: payload.notes || null,
      waiver_id: payload.waiver_id || null,
      status: "active",
      start_date: todayPT,
      stripe_customer_id: session.customer,
      stripe_subscription_id: subscriptionId,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      recurring_consent_at: new Date().toISOString(),
      recurring_consent_version: payload.recurring_consent_version || "v1",
      recurring_consent_amount_cents: payload.recurring_consent_amount_cents ?? null,
      membership_agreement_version: payload.membership_agreement_version || null,
      membership_agreement_text: payload.membership_agreement_text || null,
      membership_agreement_accepted_at:
        payload.membership_agreement_accepted === true ? new Date().toISOString() : null,
      sms_consent: smsConsent,
      sms_consent_at: smsConsent ? new Date().toISOString() : null,
      sms_consent_text: payload.sms_consent_text || null,
      sms_consent_version: payload.sms_consent_version || null,
    })
    .select("id")
    .single();

  if (insErr || !newMembership) {
    console.error("[membership webhook] insert failed", insErr);
    return;
  }

  const { data: slot } = await supabase
    .from("standing_slots")
    .select("day_of_week, start_time, end_time, instructor_id")
    .eq("id", payload.standing_slot_id)
    .maybeSingle();

  if (slot) {
    const [y, m, d] = todayPT.split("-").map(Number);
    let cursor = new Date(Date.UTC(y, m - 1, d));
    while (cursor.getUTCDay() !== slot.day_of_week) {
      cursor = new Date(cursor.getTime() + 86400000);
    }
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 8; i++) {
      const iso = cursor.toISOString().slice(0, 10);
      rows.push({
        membership_id: newMembership.id,
        occurrence_date: iso,
        start_time: slot.start_time,
        end_time: slot.end_time,
        instructor_id: slot.instructor_id,
        status: "scheduled",
      });
      cursor = new Date(cursor.getTime() + 7 * 86400000);
    }
    const { error: occErr } = await supabase.from("membership_occurrences").insert(rows);
    if (occErr) console.error("[membership webhook] occurrence insert failed", occErr);
  }

  console.log("[membership webhook] membership created", newMembership.id);
}
