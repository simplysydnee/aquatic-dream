// Shared helper to build & send the private/semi-private lesson confirmation email.
// Used by confirm-private-booking (initial send) and resend-private-booking-confirmation (manual resend).
import { buildSessionCalendarLinks } from "./calendar-links.ts";
import { getPrivateLessonPrice, isJunePromoDate } from "./private-lesson-pricing.ts";

interface SendOpts {
  mode: "initial" | "resend";
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

function formatTime(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hh = parseInt(h, 10);
  const ampm = hh >= 12 ? "PM" : "AM";
  const display = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${display}:${m} ${ampm}`;
}

function lessonTypeLabel(t: string | null | undefined): string {
  if (t === "semi_private" || t === "semi-private") return "Semi-Private Lesson";
  return "Private Lesson";
}

export async function sendPrivateBookingConfirmation(
  supabase: any,
  booking_id: string,
  opts: SendOpts,
): Promise<SendResult> {
  const { data: booking, error: bErr } = await supabase
    .from("lesson_bookings").select("*").eq("id", booking_id).maybeSingle();
  if (bErr || !booking) return { ok: false, error: bErr?.message || "Booking not found" };

  const { data: occsRaw, error: oErr } = await supabase
    .from("lesson_booking_occurrences")
    .select("occurrence_date,status")
    .eq("booking_id", booking_id)
    .order("occurrence_date");
  if (oErr) return { ok: false, error: oErr.message };

  const occList = (occsRaw || []).filter((o: any) => o.status !== "cancelled");
  if (occList.length === 0) {
    return { ok: false, error: "No active occurrences for booking" };
  }

  // Determine if this is the parent's FIRST private/semi-private booking with us.
  // Looks at earliest active booking for this parent_email.
  let isFirstPrivateLesson = false;
  try {
    const { data: prior } = await supabase
      .from("lesson_bookings")
      .select("id,created_at")
      .ilike("parent_email", booking.parent_email)
      .in("lesson_type", ["private", "semi_private", "semi-private"])
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    isFirstPrivateLesson = !prior || prior.id === booking_id;
  } catch (_) {
    isFirstPrivateLesson = false;
  }

  const b: any = booking;
  const schedule = occList.map((o: any) => ({
    date: new Date(o.occurrence_date + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    }),
    time: `${formatTime(b.start_time)} – ${formatTime(b.end_time)}`,
  }));

  let icsLink: string | undefined;
  let googleCalendarLink: string | undefined;
  if (occList.length > 0 && b.start_time && b.end_time) {
    const childLabel = b.child_first_name || b.child_name || "Swimmer";
    const links = buildSessionCalendarLinks({
      uid: `private-booking-${booking_id}`,
      title: `${childLabel}'s Private Lesson — Aquatic Dreams`,
      dates: occList.map((o: any) => o.occurrence_date),
      start: b.start_time,
      end: b.end_time,
      location: "1212 Kansas Ave, Modesto, CA 95351",
      description: `Private swim lesson with ${b.instructor_name || "your instructor"}. Questions: info@aquaticdreamsswim.com / (209) 577-3483`,
    });
    icsLink = links.icsUrl;
    googleCalendarLink = links.googleUrl;
  }

  const perPrices = occList.map((o: any) => getPrivateLessonPrice(b.lesson_type, o.occurrence_date));
  const total = perPrices.reduce((s: number, p: number) => s + p, 0);
  const allSame = perPrices.every((p: number) => p === perPrices[0]);
  const isSemi = b.lesson_type === "semi_private" || b.lesson_type === "semi-private";

  const totalAmountDue = allSame
    ? `$${total.toFixed(2)} (charged $${perPrices[0].toFixed(0)} the day of each lesson)`
    : `$${total.toFixed(2)} total — June lessons $50 each, other lessons $65 each, charged the day of each lesson`;

  let chargeNotice: string;
  if (isSemi) {
    chargeNotice =
      `Your card on file will be charged $${perPrices[0].toFixed(0)} the day of each semi-private lesson. ` +
      `Nothing to pay now — just show up.`;
  } else {
    const hasJune = occList.some((o: any) => isJunePromoDate(o.occurrence_date));
    const hasPostJune = occList.some((o: any) => !isJunePromoDate(o.occurrence_date));
    if (hasJune && hasPostJune) {
      chargeNotice =
        "Your card on file will be charged $50 the day of each June lesson and $65 for any lesson after June. " +
        "Nothing to pay now — just show up.";
    } else if (hasJune) {
      chargeNotice =
        "Your card on file will be charged $50 the day of each lesson (June special — normally $65). " +
        "Nothing to pay now — just show up.";
    } else {
      chargeNotice =
        "Your card on file will be charged $65 the day of each lesson. " +
        "Nothing to pay now — just show up.";
    }
  }

  const idempotencyKey = opts.mode === "resend"
    ? `private-booking-resend-${booking_id}-${Date.now()}`
    : `private-booking-${booking_id}`;

  const emailBody = {
    templateName: "lesson-booking-confirmation",
    recipientEmail: b.parent_email,
    idempotencyKey,
    templateData: {
      parentName: b.parent_first_name || b.parent_name,
      childName: b.child_first_name || b.child_name,
      lessonTypeLabel: lessonTypeLabel(b.lesson_type),
      instructorName: b.instructor_name,
      seriesMode: schedule.length > 1,
      totalOccurrences: schedule.length,
      totalAmountDue,
      scheduleList: schedule,
      lessonDate: schedule[0]?.date,
      lessonTime: schedule[0]?.time,
      amountDue: `$${perPrices[0].toFixed(0)}`,
      waiverSigned: true,
      icsLink,
      googleCalendarLink,
      chargeNotice,
      isFirstPrivateLesson,
      // NOTE: no paymentLink — private lesson flow uses card on file.
    },
  };

  let emailErrorMsg: string | null = null;
  try {
    const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
      "send-transactional-email",
      { body: emailBody },
    );
    const apiErr = (invokeData as any)?.error;
    if (invokeErr || apiErr) {
      emailErrorMsg = String(invokeErr?.message || apiErr || "unknown error");
      console.error("private booking confirmation email failed", {
        booking_id, recipient: b.parent_email, mode: opts.mode, invokeErr, apiErr,
      });
    }
  } catch (e: any) {
    emailErrorMsg = e?.message || String(e);
    console.error("private booking confirmation email threw", {
      booking_id, mode: opts.mode, error: emailErrorMsg,
    });
  }

  await supabase.from("lesson_bookings").update(
    emailErrorMsg
      ? { confirmation_email_status: "failed", confirmation_email_error: emailErrorMsg }
      : {
          confirmation_email_status: "sent",
          confirmation_email_sent_at: new Date().toISOString(),
          confirmation_email_error: null,
        },
  ).eq("id", booking_id);

  return emailErrorMsg ? { ok: false, error: emailErrorMsg } : { ok: true };
}
