import { createClient } from "npm:@supabase/supabase-js@2";
import { logOutboundSms } from "../_shared/sms-log.ts";
import { loadOptOutPhones, optOutPhoneKey } from "../_shared/sms-opt-out.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const TM_USER = Deno.env.get("TEXTMAGIC_USERNAME");
const TM_KEY = Deno.env.get("TEXTMAGIC_API_KEY");

function normalizePhone(raw: string | null | undefined): string | null {
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

function formatPTTime(timeStr: string): string {
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function ptToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: claims.claims.sub, _role: "admin",
  });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const reqBody = await req.json().catch(() => ({})) as { dryRun?: boolean };
  const dryRun = reqBody?.dryRun === true;

  const today = ptToday();

  // Within one run, never text the same phone twice for the same lesson slot.
  const runKeys = new Set<string>();
  let suppressedDuplicatePhone = 0;
  const dryRunPlan: Array<{
    source: "legacy" | "membership";
    phone: string;
    message: string;
    occurrence_id: string;
    swimmer: string;
    time: string;
  }> = [];

  let skippedNoConsent = 0, skippedOptedOut = 0;
  const optedOut = await loadOptOutPhones(admin);

  const { data: occs, error: occErr } = await admin
    .from("lesson_booking_occurrences")
    .select(`id, occurrence_date, status, start_time_override,
             lesson_bookings!inner(id, status, child_name, child_first_name, parent_phone, start_time)`)
    .eq("occurrence_date", today)
    .eq("status", "scheduled");

  if (occErr) {
    return new Response(JSON.stringify({ error: occErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const legacyList = (occs || []) as any[];
  const sentIds = new Set<string>();
  if (legacyList.length) {
    // Scope by today's occurrence ids rather than a timestamp window: no timezone offset math.
    const { data: alreadySent } = await admin
      .from("reminder_logs")
      .select("lesson_occurrence_id")
      .eq("channel", "sms")
      .eq("status", "sent")
      .eq("reminder_kind", "manual_today")
      .in("lesson_occurrence_id", legacyList.map((o) => o.id));
    for (const r of (alreadySent || []) as any[]) sentIds.add(r.lesson_occurrence_id);
  }

  let legacySent = 0, membershipSent = 0, failed = 0;

  const errors: Array<{ occurrence_id: string; error: string }> = [];

  // Identity is the swimmer, not the phone: siblings share a phone and a start time
  // and must each get their own text. Only the SAME swimmer enrolled twice collapses.
  // identity falls back to a per-row unique id when swimmer identity is unknown.
  const runKey = (phone: string, date: string, time: string | null, identity: string) =>
    `${phone.replace(/\D/g, "").slice(-10)}|${date}|${time ?? ""}|${identity}`;

  for (const o of legacyList) {
    const b = o.lesson_bookings;
    if (!b || b.status === "cancelled") continue;
    if (sentIds.has(o.id)) continue;

    const firstName = b.child_first_name || (b.child_name || "").split(" ")[0] || "Your swimmer";
    const startTime = o.start_time_override || b.start_time;
    const phone = normalizePhone(b.parent_phone);
    const timeStr = startTime ? formatPTTime(startTime) : "";
    const message = `${firstName} has a swim lesson today at ${timeStr} at Aquatic Dreams. See you there!`;

    if (!phone) {
      failed++;
      errors.push({ occurrence_id: o.id, error: "no_phone" });
      if (!dryRun) {
        await admin.from("reminder_logs").insert({
          swimmer_name: b.child_name, lesson_occurrence_id: o.id, booking_id: b.id,
          channel: "sms", reminder_kind: "manual_today", phone: null, message,
          status: "failed", error: "no_phone",
        });
      }
      continue;
    }

    const legacyOptKey = optOutPhoneKey(phone);
    if (legacyOptKey && optedOut.has(legacyOptKey)) { skippedOptedOut++; continue; }

    const key = runKey(phone, today, startTime, `legacy-booking:${b.id}`);
    if (runKeys.has(key)) { suppressedDuplicatePhone++; continue; }
    runKeys.add(key);

    if (dryRun) {
      dryRunPlan.push({ source: "legacy", phone, message, occurrence_id: o.id, swimmer: b.child_name, time: timeStr });
      legacySent++;
      continue;
    }


    const result = await sendSms(phone, message);
    await logOutboundSms({ admin: admin, kind: "reminder", sentByLabel: "System - today's reminders" }, { phone, body: message, status: result.ok ? "sent" : "failed", error: result.ok ? null : result.error ?? null });
    await admin.from("reminder_logs").insert({
      swimmer_name: b.child_name, lesson_occurrence_id: o.id, booking_id: b.id,
      channel: "sms", reminder_kind: "manual_today", phone, message,
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
    .eq("occurrence_date", today)
    .eq("status", "scheduled");

  if (mErr) {
    errors.push({ occurrence_id: "membership_query", error: mErr.message });
  }

  const mList = (mOccs || []) as any[];
  const mSentIds = new Set<string>();
  if (mList.length) {
    const { data: mAlready } = await admin
      .from("reminder_logs")
      .select("membership_occurrence_id")
      .eq("channel", "sms")
      .eq("status", "sent")
      .eq("reminder_kind", "manual_today")
      .in("membership_occurrence_id", mList.map((o) => o.id));
    for (const r of (mAlready || []) as any[]) mSentIds.add(r.membership_occurrence_id);
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
      ? `You have a swim lesson today at ${timeStr} at Aquatic Dreams. See you there!`
      : `${m.child_first_name || "Your swimmer"} has a swim lesson today at ${timeStr} at Aquatic Dreams. See you there!`;

    if (!phone) {
      failed++;
      errors.push({ occurrence_id: o.id, error: "no_phone" });
      if (!dryRun) {
        await admin.from("reminder_logs").insert({
          swimmer_name: swimmerName, membership_occurrence_id: o.id,
          channel: "sms", reminder_kind: "manual_today", phone: null, message,
          status: "failed", error: "no_phone",
        });
      }
      continue;
    }

    const optKey = optOutPhoneKey(phone);
    if (optKey && optedOut.has(optKey)) { skippedOptedOut++; continue; }

    const identity = m.swimmer_id ? `swimmer:${m.swimmer_id}` : `membership:${m.id}`;
    const key = runKey(phone, today, o.start_time, identity);
    if (runKeys.has(key)) { suppressedDuplicatePhone++; continue; }
    runKeys.add(key);

    if (dryRun) {
      dryRunPlan.push({ source: "membership", phone, message, occurrence_id: o.id, swimmer: swimmerName ?? "", time: timeStr });
      membershipSent++;
      continue;
    }

    const result = await sendSms(phone, message);
    await logOutboundSms({ admin: admin, kind: "reminder", sentByLabel: "System - today's reminders" }, { phone, body: message, status: result.ok ? "sent" : "failed", error: result.ok ? null : result.error ?? null });
    await admin.from("reminder_logs").insert({
      swimmer_name: swimmerName, membership_occurrence_id: o.id,
      channel: "sms", reminder_kind: "manual_today", phone, message,
      sent_at: result.ok ? new Date().toISOString() : null,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.error,
    });
    if (result.ok) membershipSent++;
    else { failed++; errors.push({ occurrence_id: o.id, error: result.error || "unknown" }); }
  }

  return new Response(JSON.stringify({
    ok: true,
    date: today,
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
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },

  });
});
