// Shared TextMagic SMS helpers + PT formatting + reminder_logs logging.
// Existing reminder edge functions still use their own inline copies of these
// helpers; this module is for NEW SMS code paths only (booking confirmations).

const TM_USER = Deno.env.get("TEXTMAGIC_USERNAME");
const TM_KEY = Deno.env.get("TEXTMAGIC_API_KEY");

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) {
    const d = "+" + trimmed.slice(1).replace(/\D/g, "");
    return d.length > 1 ? d : null;
  }
  const just = trimmed.replace(/\D/g, "");
  if (just.length === 10) return `+1${just}`;
  if (just.length === 11 && just.startsWith("1")) return `+${just}`;
  return just ? `+${just}` : null;
}

// "15:30" or "15:30:00" -> "3:30 PM"
export function formatPTTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr || "0", 10);
  if (Number.isNaN(h)) return "";
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// "2026-06-17" + options -> formatted in America/Los_Angeles.
// Uses noon UTC on the given date to dodge DST/midnight edge cases.
export function formatPTDate(
  dateStr: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "short", day: "numeric" },
): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", ...opts }).format(d);
}

export async function sendSms(
  phone: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!TM_USER || !TM_KEY) return { ok: false, error: "textmagic_not_configured" };
  try {
    const body = new URLSearchParams({ text, phones: phone });
    const res = await fetch("https://rest.textmagic.com/api/v2/messages", {
      method: "POST",
      headers: {
        "X-TM-Username": TM_USER,
        "X-TM-Key": TM_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const txt = await res.text();
    if (!res.ok) return { ok: false, error: `tm_${res.status}: ${txt.slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface LogSmsRow {
  swimmer_name?: string | null;
  booking_id?: string | null;
  lesson_occurrence_id?: string | null;
  enrollment_id?: string | null;
  phone: string | null;
  message: string;
  status: "sent" | "failed";
  error?: string | null;
  reminder_kind?: string;
}

// admin = createClient(SERVICE_ROLE) — keep this loose so the caller can pass
// whichever Supabase client they already have in scope without us importing
// the SDK types here.
export async function logSms(admin: any, row: LogSmsRow): Promise<void> {
  try {
    await admin.from("reminder_logs").insert({
      swimmer_name: row.swimmer_name ?? null,
      booking_id: row.booking_id ?? null,
      lesson_occurrence_id: row.lesson_occurrence_id ?? null,
      enrollment_id: row.enrollment_id ?? null,
      channel: "sms",
      reminder_kind: row.reminder_kind ?? "booking_confirmation",
      phone: row.phone,
      message: row.message,
      sent_at: row.status === "sent" ? new Date().toISOString() : null,
      status: row.status,
      error: row.error ?? null,
    });
  } catch (e) {
    console.error("logSms insert failed:", e instanceof Error ? e.message : String(e));
  }
}

// Convenience: build message + send + log. Returns the result.
export async function sendAndLogBookingConfirmation(
  admin: any,
  args: {
    phoneRaw: string | null | undefined;
    message: string;
    swimmer_name?: string | null;
    booking_id?: string | null;
    lesson_occurrence_id?: string | null;
    enrollment_id?: string | null;
    reminder_kind?: string;
  },
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const phone = normalizePhone(args.phoneRaw);
  if (!phone) {
    await logSms(admin, {
      swimmer_name: args.swimmer_name,
      booking_id: args.booking_id,
      lesson_occurrence_id: args.lesson_occurrence_id,
      enrollment_id: args.enrollment_id,
      phone: null,
      message: args.message,
      status: "failed",
      error: "no_phone",
      reminder_kind: args.reminder_kind,
    });
    return { ok: false, error: "no_phone", skipped: true };
  }
  const result = await sendSms(phone, args.message);
  await logSms(admin, {
    swimmer_name: args.swimmer_name,
    booking_id: args.booking_id,
    lesson_occurrence_id: args.lesson_occurrence_id,
    enrollment_id: args.enrollment_id,
    phone,
    message: args.message,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : result.error ?? null,
    reminder_kind: args.reminder_kind,
  });
  return result;
}

// 20 -> "20 min", 60 -> "1 hr", 90 -> "1.5 hrs", 2880 -> "48 hrs"
export function formatHoldWindow(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "48 hrs";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  const rounded = Math.round(hours * 2) / 2;
  if (rounded === 1) return "1 hr";
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} hrs`;
}
