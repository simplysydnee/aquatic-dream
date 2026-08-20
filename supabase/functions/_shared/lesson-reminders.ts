// Single source of truth for lesson reminder selection + sending.
// Both the admin "send today's reminders" button and the automated 24h cron
// call runLessonReminders. Do not reimplement any of this logic elsewhere:
// two copies would drift silently and the drift would reach parents.

import { logOutboundSms } from "./sms-log.ts";
import { loadOptOutPhones, optOutPhoneKey } from "./sms-opt-out.ts";

const TM_USER = Deno.env.get("TEXTMAGIC_USERNAME");
const TM_KEY = Deno.env.get("TEXTMAGIC_API_KEY");

// deno-lint-ignore no-explicit-any
type AnyClient = any;

export type ReminderKind = "manual_today" | "lesson_24h";

export interface PlanRow {
  source: "legacy" | "membership";
  phone: string;
  message: string;
  occurrence_id: string;
  swimmer: string;
  time: string;
}

export interface ReminderRunResult {
  date: string;
  reminder_kind: ReminderKind;
  dry_run: boolean;
  legacy_sent: number;
  membership_sent: number;
  sent: number;
  failed: number;
  suppressed_duplicate_phone: number;
  skipped_no_consent: number;
  skipped_opted_out: number;
  errors: Array<{ occurrence_id: string; error: string }>;
  would_send?: PlanRow[];
}

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

export function formatPTTime(timeStr: string): string {
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/** Calendar date in Pacific, YYYY-MM-DD. No toISOString round trips. */
export function ptDate(offsetDays = 0): string {
  const base = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

async function sendSms(phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
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

// Identity is the swimmer, not the phone: siblings share a phone and a start time
// and must each get their own text. Only the SAME swimmer enrolled twice collapses.
const runKey = (phone: string, date: string, time: string | null, identity: string) =>
  `${phone.replace(/\D/g, "").slice(-10)}|${date}|${time ?? ""}|${identity}`;

export async function runLessonReminders(
  admin: AnyClient,
  targetDate: string,
  reminderKind: ReminderKind,
  dryRun: boolean,
  sentByLabel = "System - lesson reminders",
): Promise<ReminderRunResult> {
  const dayWord = reminderKind === "lesson_24h" ? "tomorrow" : "today";

  const runKeys = new Set<string>();
  let suppressedDuplicatePhone = 0;
  let skippedNoConsent = 0;
  let skippedOptedOut = 0;
  let legacySent = 0, membershipSent = 0, failed = 0;
  const dryRunPlan: PlanRow[] = [];
  const errors: Array<{ occurrence_id: string; error: string }> = [];

  const optedOut = await loadOptOutPhones(admin);

  // ===== Legacy lesson_booking_occurrences =====
  const { data: occs, error: occErr } = await admin
    .from("lesson_booking_occurrences")
    .select(`id, occurrence_date, status, start_time_override,
             lesson_bookings!inner(id, status, child_name, child_first_name, parent_phone, start_time)`)
    .eq("occurrence_date", targetDate)
    .eq("status", "scheduled");

  if (occErr) throw new Error(occErr.message);

  const legacyList = (occs || []) as AnyClient[];
  const sentIds = new Set<string>();
  if (legacyList.length) {
    // Scope by today's occurrence ids rather than a timestamp window: no timezone offset math.
    const { data: alreadySent } = await admin
      .from("reminder_logs")
      .select("lesson_occurrence_id")
      .eq("channel", "sms")
      .eq("status", "sent")
      .eq("reminder_kind", reminderKind)
      .in("lesson_occurrence_id", legacyList.map((o) => o.id));
    for (const r of (alreadySent || []) as AnyClient[]) sentIds.add(r.lesson_occurrence_id);
  }

  for (const o of legacyList) {
    const b = o.lesson_bookings;
    if (!b || b.status === "cancelled") continue;
    if (sentIds.has(o.id)) continue;

    const firstName = b.child_first_name || (b.child_name || "").split(" ")[0] || "Your swimmer";
    const startTime = o.start_time_override || b.start_time;
    const phone = normalizePhone(b.parent_phone);
    const timeStr = startTime ? formatPTTime(startTime) : "";
    const message =
      `${firstName} has a swim lesson ${dayWord} at ${timeStr} at Aquatic Dreams. See you there!`;

    if (!phone) {
      failed++;
      errors.push({ occurrence_id: o.id, error: "no_phone" });
      if (!dryRun) {
        await admin.from("reminder_logs").insert({
          swimmer_name: b.child_name, lesson_occurrence_id: o.id, booking_id: b.id,
          channel: "sms", reminder_kind: reminderKind, phone: null, message,
          status: "failed", error: "no_phone",
        });
      }
      continue;
    }

    const legacyOptKey = optOutPhoneKey(phone);
    if (legacyOptKey && optedOut.has(legacyOptKey)) { skippedOptedOut++; continue; }

    const key = runKey(phone, targetDate, startTime, `legacy-booking:${b.id}`);
    if (runKeys.has(key)) { suppressedDuplicatePhone++; continue; }
    runKeys.add(key);

    if (dryRun) {
      dryRunPlan.push({ source: "legacy", phone, message, occurrence_id: o.id, swimmer: b.child_name, time: timeStr });
      legacySent++;
      continue;
    }

    const result = await sendSms(phone, message);
    await logOutboundSms(
      { admin, kind: "reminder", sentByLabel },
      { phone, body: message, status: result.ok ? "sent" : "failed", error: result.ok ? null : result.error ?? null },
    );
    await admin.from("reminder_logs").insert({
      swimmer_name: b.child_name, lesson_occurrence_id: o.id, booking_id: b.id,
      channel: "sms", reminder_kind: reminderKind, phone, message,
      sent_at: result.ok ? new Date().toISOString() : null,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.error,
    });
    if (result.ok) legacySent++;
    else { failed++; errors.push({ occurrence_id: o.id, error: result.error || "unknown" }); }
  }

  // ===== Membership occurrences (current system) =====
  const { data: mOccs, error: mErr } = await admin
    .from("membership_occurrences")
    .select(`id, occurrence_date, status, start_time,
             memberships!inner(id, swimmer_id, status, plan_key, sms_consent, parent_phone, child_first_name, child_last_name)`)
    .eq("occurrence_date", targetDate)
    .eq("status", "scheduled");

  if (mErr) errors.push({ occurrence_id: "membership_query", error: mErr.message });

  const mList = (mOccs || []) as AnyClient[];
  const mSentIds = new Set<string>();
  if (mList.length) {
    const { data: mAlready } = await admin
      .from("reminder_logs")
      .select("membership_occurrence_id")
      .eq("channel", "sms")
      .eq("status", "sent")
      .eq("reminder_kind", reminderKind)
      .in("membership_occurrence_id", mList.map((o) => o.id));
    for (const r of (mAlready || []) as AnyClient[]) mSentIds.add(r.membership_occurrence_id);
  }

  for (const o of mList) {
    const m = o.memberships;
    if (!m) continue;
    if (!["active", "pending_cancel", "paused"].includes(m.status)) continue;
    if (mSentIds.has(o.id)) continue;
    // Consent fails closed: NULL is not consent.
    if (m.sms_consent !== true) { skippedNoConsent++; continue; }

    const swimmerName = [m.child_first_name, m.child_last_name].filter(Boolean).join(" ") || null;
    const phone = normalizePhone(m.parent_phone);
    const timeStr = o.start_time ? formatPTTime(o.start_time) : "";
    const message = m.plan_key === "adult_group"
      ? `You have a swim lesson ${dayWord} at ${timeStr} at Aquatic Dreams. See you there!`
      : `${m.child_first_name || "Your swimmer"} has a swim lesson ${dayWord} at ${timeStr} at Aquatic Dreams. See you there!`;

    if (!phone) {
      failed++;
      errors.push({ occurrence_id: o.id, error: "no_phone" });
      if (!dryRun) {
        await admin.from("reminder_logs").insert({
          swimmer_name: swimmerName, membership_occurrence_id: o.id,
          channel: "sms", reminder_kind: reminderKind, phone: null, message,
          status: "failed", error: "no_phone",
        });
      }
      continue;
    }

    const optKey = optOutPhoneKey(phone);
    if (optKey && optedOut.has(optKey)) { skippedOptedOut++; continue; }

    const identity = m.swimmer_id ? `swimmer:${m.swimmer_id}` : `membership:${m.id}`;
    const key = runKey(phone, targetDate, o.start_time, identity);
    if (runKeys.has(key)) { suppressedDuplicatePhone++; continue; }
    runKeys.add(key);

    if (dryRun) {
      dryRunPlan.push({ source: "membership", phone, message, occurrence_id: o.id, swimmer: swimmerName ?? "", time: timeStr });
      membershipSent++;
      continue;
    }

    const result = await sendSms(phone, message);
    await logOutboundSms(
      { admin, kind: "reminder", sentByLabel },
      { phone, body: message, status: result.ok ? "sent" : "failed", error: result.ok ? null : result.error ?? null },
    );
    await admin.from("reminder_logs").insert({
      swimmer_name: swimmerName, membership_occurrence_id: o.id,
      channel: "sms", reminder_kind: reminderKind, phone, message,
      sent_at: result.ok ? new Date().toISOString() : null,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.error,
    });
    if (result.ok) membershipSent++;
    else { failed++; errors.push({ occurrence_id: o.id, error: result.error || "unknown" }); }
  }

  return {
    date: targetDate,
    reminder_kind: reminderKind,
    dry_run: dryRun,
    legacy_sent: legacySent,
    membership_sent: membershipSent,
    sent: legacySent + membershipSent,
    failed,
    suppressed_duplicate_phone: suppressedDuplicatePhone,
    skipped_no_consent: skippedNoConsent,
    skipped_opted_out: skippedOptedOut,
    errors,
    ...(dryRun ? { would_send: dryRunPlan } : {}),
  };
}
