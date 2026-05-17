// Shared helper to (re)send the enrollment confirmation email with calendar
// invite links. Used by payments-webhook (initial confirmation) and
// resend-enrollment-confirmation (after a move/level/time change).

import { buildSessionCalendarLinks } from "./calendar-links.ts";

type SupabaseClient = ReturnType<typeof import("npm:@supabase/supabase-js@2").createClient>;

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

export interface SendEnrollmentConfirmationOptions {
  /** Reason suffix to keep idempotency keys unique on re-sends. */
  reason?: string;
  /** Optional one-line banner shown at top of the email (e.g. class change). */
  changeNotice?: string;
}

export async function sendEnrollmentConfirmation(
  supabase: SupabaseClient,
  enrollmentId: string,
  opts: SendEnrollmentConfirmationOptions = {},
): Promise<{ ok: boolean; error?: string }> {
  const { data: enrollment, error: enrollErr } = await supabase
    .from("swim_enrollments")
    .select(
      "*, swim_sessions(id, session_period_id, day_of_week, start_time, end_time, swim_level, session_price, session_start_date, session_end_date)",
    )
    .eq("id", enrollmentId)
    .maybeSingle();

  if (enrollErr || !enrollment) {
    return { ok: false, error: enrollErr?.message || "enrollment not found" };
  }

  const sessionId = (enrollment as any).session_id;
  if (!sessionId) return { ok: false, error: "no session_id" };

  const { data: lessonDates } = await supabase
    .from("session_lesson_dates")
    .select("lesson_date")
    .eq("session_id", sessionId)
    .eq("is_cancelled", false)
    .order("lesson_date");

  const formattedDates = (lessonDates || []).map((d: any) => {
    const date = new Date(d.lesson_date + "T00:00:00");
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  });

  let periodName = "Session";
  const session = (enrollment as any).swim_sessions;
  if (session?.session_period_id) {
    const { data: period } = await supabase
      .from("session_periods")
      .select("name")
      .eq("id", session.session_period_id)
      .maybeSingle();
    if (period) periodName = (period as any).name;
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

  const e: any = enrollment;
  const levelLabel = getLevelLabel(e.swim_level, e.child_age);
  const groupName = getGroupName(e.swim_level, e.child_age);

  const sessionPrice = session?.session_price ?? 240;
  const isFirstTime = e.is_first_time;
  const paidOnThisRow = Number(e.payment_amount ?? 0);

  const firstClassDate =
    lessonDates && lessonDates.length > 0
      ? formatLongDate((lessonDates[0] as any).lesson_date)
      : sessionStartDate;

  let icsLink: string | undefined;
  let googleCalendarLink: string | undefined;
  if (lessonDates && lessonDates.length > 0 && session?.start_time && session?.end_time) {
    const titleParts = [
      e.child_name ? `${e.child_name}'s Swim Lesson` : "Swim Lesson",
      groupName ? `— ${groupName}` : "",
      levelLabel ? `(${levelLabel})` : "",
      "— Aquatic Dreams",
    ].filter(Boolean);
    const links = buildSessionCalendarLinks({
      uid: `enroll-${enrollmentId}`,
      title: titleParts.join(" "),
      dates: (lessonDates as any[]).map((d) => d.lesson_date),
      start: session.start_time,
      end: session.end_time,
      location: "1212 Kansas Ave, Modesto, CA 95351",
      description:
        "Aquatic Dreams swim lesson. Questions: info@aquaticdreamsswim.com / (209) 577-3483",
    });
    icsLink = links.icsUrl;
    googleCalendarLink = links.googleUrl;
  }

  const reason = opts.reason ?? "initial";
  const updatedAt = e.updated_at ? new Date(e.updated_at).getTime() : Date.now();
  const idempotencyKey =
    reason === "initial"
      ? `enrollment-confirm-${enrollmentId}`
      : `enrollment-confirm-${enrollmentId}-${reason}-${updatedAt}`;

  const { error: invokeErr } = await supabase.functions.invoke("send-transactional-email", {
    body: {
      templateName: "enrollment-confirmation",
      recipientEmail: e.parent_email,
      idempotencyKey,
      templateData: {
        parentName: e.parent_name,
        childName: e.child_name,
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
        paymentReference: e.stripe_payment_id || undefined,
        icsLink,
        googleCalendarLink,
        changeNotice: opts.changeNotice,
      },
    },
  });

  if (invokeErr) return { ok: false, error: invokeErr.message };
  return { ok: true };
}
