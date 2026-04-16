import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { type StripeEnv, verifyWebhook } from "../_shared/stripe.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const env = (url.searchParams.get('env') || 'sandbox') as StripeEnv;

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
  const enrollmentId = session.metadata?.enrollmentId;
  if (!enrollmentId) {
    console.log("No enrollmentId in checkout metadata, skipping");
    return;
  }

  console.log("Updating enrollment payment status:", enrollmentId);

  const { error } = await supabase
    .from("swim_enrollments")
    .update({
      payment_status: "paid",
      stripe_payment_id: session.payment_intent || session.id,
    })
    .eq("id", enrollmentId);

  if (error) {
    console.error("Failed to update enrollment:", error);
    return;
  }

  console.log("Enrollment payment marked as paid:", enrollmentId);

  // Send enrollment confirmation email after successful payment
  await sendEnrollmentConfirmation(enrollmentId);
}

async function sendEnrollmentConfirmation(enrollmentId: string) {
  try {
    // Fetch enrollment with session details
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

    // Fetch lesson dates
    const { data: lessonDates } = await supabase
      .from("session_lesson_dates")
      .select("lesson_date")
      .eq("session_id", sessionId)
      .eq("is_cancelled", false)
      .order("lesson_date");

    const formattedDates = (lessonDates || []).map(d => {
      const date = new Date(d.lesson_date + "T00:00:00");
      return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    });

    // Fetch period name
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

    // Format session info
    const sessionInfo = session
      ? `${periodName} — ${session.day_of_week} ${
          session.start_time
            ? new Date(`2000-01-01T${session.start_time}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
            : ""
        }`
      : undefined;

    // Level label
    const levelLabel = getLevelLabel(enrollment.swim_level, enrollment.child_age);
    const groupName = getGroupName(enrollment.swim_level, enrollment.child_age);

    // Payment details
    const regFee = enrollment.registration_fee ?? 0;
    const sessionPrice = session?.session_price ?? 280;
    const isFirstTime = enrollment.is_first_time;

    const firstClassDate = lessonDates && lessonDates.length > 0
      ? new Date(lessonDates[0].lesson_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
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
