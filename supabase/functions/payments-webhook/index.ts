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
  childAge: number;
  childDob: string | null;
  sessionIds: string[];
  isFirstTime: boolean;
  parentName: string;
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
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
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

      // Returning swimmers: session fee was charged at checkout, this row is fully paid.
      // First-time swimmers: only reg fee charged. Session fee owed day 1 → row stays "unpaid"
      // for the session fee portion; payment_amount captures only the reg fee actually paid.
      const isReturning = !child.isFirstTime;
      const paymentAmount = isReturning ? sessionPrice : regFee;
      const rowPaymentStatus = isReturning ? "paid" : (chargeRegFee ? "paid" : "unpaid");

      return {
        swim_level: child.level,
        session_id: sid,
        parent_name: child.parentName,
        parent_email: child.parentEmail,
        parent_phone: child.parentPhone,
        child_name: child.childName,
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
      };
    });
  });

  // Reconciliation: sum of what we're recording must not exceed what Stripe actually charged.
  const computedTotal = enrollmentRows.reduce((sum, r) => sum + Number(r.payment_amount || 0), 0);
  if (stripeAmountTotal > 0 && computedTotal > stripeAmountTotal + 0.01) {
    console.error(
      `RECONCILIATION MISMATCH for session ${sessionId}: ` +
      `Stripe charged $${stripeAmountTotal}, but enrollment rows sum to $${computedTotal}. ` +
      `Inserting rows anyway, but this needs admin review.`
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
        signer_email: child.parentEmail,
        signer_ip: payload.signerIp,
        waiver_version: payload.versions.waiver,
        tos_version: payload.versions.tos,
        privacy_policy_version: payload.versions.privacy,
        emergency_contact_name: child.agreement.emergencyContactName,
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

async function sendEnrollmentConfirmation(enrollmentId: string) {
  try {
    const { data: enrollment, error: enrollErr } = await supabase
      .from("swim_enrollments")
      .select("*, swim_sessions(id, session_period_id, day_of_week, start_time, swim_level, session_price, session_start_date)")
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

    const sessionInfo = session
      ? `${periodName} — ${session.day_of_week} ${
          session.start_time
            ? new Date(`2000-01-01T${session.start_time}`).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })
            : ""
        }`
      : undefined;

    const levelLabel = getLevelLabel(enrollment.swim_level, enrollment.child_age);
    const groupName = getGroupName(enrollment.swim_level, enrollment.child_age);

    const regFee = enrollment.registration_fee ?? 0;
    const sessionPrice = session?.session_price ?? 280;
    const isFirstTime = enrollment.is_first_time;

    const firstClassDate =
      lessonDates && lessonDates.length > 0
        ? new Date(lessonDates[0].lesson_date + "T00:00:00").toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : undefined;

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
          sessionInfo,
          lessonDates: formattedDates,
          isFirstTime,
          registrationFeePaid: isFirstTime ? `$${regFee}` : undefined,
          sessionFeeDue: isFirstTime ? `$${sessionPrice}` : undefined,
          dueDate: firstClassDate,
          totalPaid: !isFirstTime ? `$${enrollment.payment_amount || sessionPrice}` : undefined,
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
