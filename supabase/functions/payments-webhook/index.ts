import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { type StripeEnv, verifyWebhook } from "../_shared/stripe.ts";

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
        if (obj?.metadata?.type === "session_fee" && obj?.metadata?.enrollmentId) {
          await handleSessionFeePaid(obj);
        } else if (obj?.metadata?.type === "lesson_booking_occurrence" && obj?.metadata?.occurrenceId) {
          await handleLessonBookingPaid(obj);
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
      //   - First-time: only $45 reg fee charged → session_fee_status='due_day_1' (collected day 1)
      const isReturning = !child.isFirstTime;
      const paymentAmount = isReturning ? sessionPrice : regFee;
      // Reg fee is one-time per family. First-timer's first row pays it; additional
      // rows (same checkout, same family) get 'not_required' — same as returning swimmers.
      const rowPaymentStatus = isReturning ? "not_required" : (chargeRegFee ? "paid" : "not_required");
      const sessionFeeStatus = isReturning ? "paid" : "due_day_1";

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
        session_fee_stripe_id: isReturning ? sessionId : null,
        session_fee_paid_at: isReturning ? new Date().toISOString() : null,
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
    })
    .eq("id", enrollmentId);
  if (error) {
    console.error("Failed to mark session fee paid:", enrollmentId, error);
  } else {
    console.log("Session fee marked paid for enrollment:", enrollmentId);
  }
}

async function handleLessonBookingPaid(checkoutSession: any) {
  const occurrenceId = checkoutSession.metadata?.occurrenceId;
  if (!occurrenceId) {
    console.warn("Lesson booking callback missing occurrenceId");
    return;
  }
  const stripeId = checkoutSession.payment_intent || checkoutSession.id;
  const { error } = await supabase
    .from("lesson_booking_occurrences")
    .update({
      payment_status: "paid",
      stripe_session_id: stripeId,
      paid_at: new Date().toISOString(),
    })
    .eq("id", occurrenceId);
  if (error) {
    console.error("Failed to mark lesson occurrence paid:", occurrenceId, error);
  } else {
    console.log("Lesson occurrence marked paid:", occurrenceId);
  }
}

async function sendEnrollmentConfirmation(enrollmentId: string) {
  try {
    const { data: enrollment, error: enrollErr } = await supabase
      .from("swim_enrollments")
      .select("*, swim_sessions(id, session_period_id, day_of_week, start_time, end_time, swim_level, session_price, session_start_date, session_end_date)")
      .eq("id", enrollmentId)
      .maybeSingle();

    if (enrollErr || !enrollment) {
      console.error("Failed to fetch enrollment for confirmation email:", enrollErr);
      return;
    }

    const sessionId = enrollment.session_id;
    if (!sessionId) return;

    const { data: lessonDates } = await supabase
      .from("session_lesson_dates")
      .select("lesson_date")
      .eq("session_id", sessionId)
      .eq("is_cancelled", false)
      .order("lesson_date");

    const formattedDates = (lessonDates || []).map((d) => {
      const date = new Date(d.lesson_date + "T00:00:00");
      return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    });

    let periodName = "Session";
    const session = enrollment.swim_sessions;
    if (session?.session_period_id) {
      const { data: period } = await supabase
        .from("session_periods")
        .select("name")
        .eq("id", session.session_period_id)
        .maybeSingle();
      if (period) periodName = period.name;
    }

    const formatTime = (t: string | null | undefined) =>
      t
        ? new Date(`2000-01-01T${t}`).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })
        : undefined;

    const formatLongDate = (d: string | null | undefined) =>
      d
        ? new Date(d + "T00:00:00").toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : undefined;

    const startTime = formatTime(session?.start_time);
    const endTime = formatTime(session?.end_time);
    const sessionStartDate = formatLongDate(session?.session_start_date);
    const sessionEndDate = formatLongDate(session?.session_end_date);

    const sessionInfo = session
      ? `${periodName} — ${session.day_of_week}${startTime ? ` ${startTime}` : ""}`
      : undefined;

    const levelLabel = getLevelLabel(enrollment.swim_level, enrollment.child_age);
    const groupName = getGroupName(enrollment.swim_level, enrollment.child_age);

    const sessionPrice = session?.session_price ?? 240;
    const isFirstTime = enrollment.is_first_time;
    // Use the EXACT amount Stripe charged on this enrollment row (validated
    // against session.amount_total in handleCheckoutCompleted).
    const paidOnThisRow = Number(enrollment.payment_amount ?? 0);

    const firstClassDate =
      lessonDates && lessonDates.length > 0
        ? formatLongDate(lessonDates[0].lesson_date)
        : sessionStartDate;

    await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "enrollment-confirmation",
        recipientEmail: enrollment.parent_email,
        idempotencyKey: `enrollment-confirm-${enrollmentId}`,
        templateData: {
          parentName: enrollment.parent_name,
          childName: enrollment.child_name,
          levelLabel,
          groupName,
          dayOfWeek: session?.day_of_week,
          startTime,
          endTime,
          sessionStartDate,
          sessionEndDate,
          sessionPeriodName: periodName,
          sessionInfo,
          lessonDates: formattedDates,
          isFirstTime,
          registrationFeePaid: isFirstTime ? `$${paidOnThisRow || 45}` : undefined,
          sessionFeeDue: isFirstTime ? `$${sessionPrice}` : undefined,
          dueDate: firstClassDate,
          totalPaid: !isFirstTime ? `$${paidOnThisRow || sessionPrice}` : undefined,
          paymentReference: enrollment.stripe_payment_id || undefined,
        },
      },
    });

    console.log("Enrollment confirmation email sent for:", enrollmentId);
  } catch (err) {
    console.error("Failed to send confirmation email:", err);
  }
}

function getLevelLabel(level: string, age: number): string {
  const ageGroup = age <= 5 ? "preschool" : "school-age";
  if (ageGroup === "preschool") {
    if (level === "white") return "Preschool 1";
    if (level === "red") return "Preschool 2";
  }
  if (level === "yellow") return "School Age 1";
  if (level === "blue") return "School Age 2";
  return "School Age 3";
}

function getGroupName(level: string, age: number): string {
  const ageGroup = age <= 5 ? "preschool" : "school-age";
  if (ageGroup === "preschool") {
    if (level === "white") return "Little Fins (White)";
    if (level === "red") return "Reef Explorers (Red)";
  }
  if (level === "yellow") return "Sea Scouts (Yellow)";
  if (level === "blue") return "Deep Sea Divers (Blue)";
  return "Ocean Masters (Green)";
}
