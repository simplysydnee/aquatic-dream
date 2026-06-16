import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TM_USER = Deno.env.get("TEXTMAGIC_USERNAME");
const TM_KEY = Deno.env.get("TEXTMAGIC_API_KEY");
const CRON_SECRET = Deno.env.get("CRON_SECRET");

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

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function ptWeekday(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Noon UTC avoids any TZ edge; format in PT.
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", weekday: "long",
  }).format(dt);
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
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const isServiceRole = !!bearer && bearer === SERVICE_ROLE;
  const isAnonBearer = !!ANON_KEY && bearer === ANON_KEY;
  const isCronSecret = !!CRON_SECRET && cronHeader === CRON_SECRET;
  if (!isServiceRole && !isAnonBearer && !isCronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const today = ptToday();
  const targets: Array<{ kind: "group_48h" | "group_24h"; date: string; when: string }> = [
    { kind: "group_48h", date: addDays(today, 2), when: "" },
    { kind: "group_24h", date: addDays(today, 1), when: "tomorrow" },
  ];

  let sent48 = 0, sent24 = 0, failed = 0;

  for (const t of targets) {
    const when = t.kind === "group_48h" ? ptWeekday(t.date) : "tomorrow";

    // session_lesson_dates for the target date (not cancelled)
    const { data: sldRows, error: sldErr } = await admin
      .from("session_lesson_dates")
      .select("id, session_id, lesson_date, is_cancelled")
      .eq("lesson_date", t.date)
      .eq("is_cancelled", false);
    if (sldErr || !sldRows || sldRows.length === 0) continue;

    // Confirm each is the first lesson_date for its session
    const sessionIds = Array.from(new Set(sldRows.map((r: any) => r.session_id)));
    const { data: minRows } = await admin
      .from("session_lesson_dates")
      .select("session_id, lesson_date")
      .in("session_id", sessionIds)
      .eq("is_cancelled", false)
      .order("lesson_date", { ascending: true });
    const minBySession = new Map<string, string>();
    for (const r of (minRows || []) as any[]) {
      if (!minBySession.has(r.session_id)) minBySession.set(r.session_id, r.lesson_date);
    }
    const firstLessonSlds = sldRows.filter((r: any) => minBySession.get(r.session_id) === r.lesson_date);
    if (firstLessonSlds.length === 0) continue;

    // Load sessions for start_time
    const usedSessionIds = Array.from(new Set(firstLessonSlds.map((r: any) => r.session_id)));
    const { data: sessions } = await admin
      .from("swim_sessions")
      .select("id, start_time")
      .in("id", usedSessionIds);
    const sessionById = new Map<string, any>((sessions || []).map((s: any) => [s.id, s]));

    // Load enrollments for those sessions
    const { data: enrollments } = await admin
      .from("swim_enrollments")
      .select("id, session_id, child_name, parent_phone, status")
      .in("session_id", usedSessionIds)
      .not("status", "in", "(cancelled,suspended)");

    // Pre-fetch already-sent log rows for these (sld, enrollment, kind)
    const enrollmentIds = (enrollments || []).map((e: any) => e.id);
    const sldIds = firstLessonSlds.map((r: any) => r.id);
    const sentKeys = new Set<string>();
    if (enrollmentIds.length && sldIds.length) {
      const { data: sentRows } = await admin
        .from("reminder_logs")
        .select("session_lesson_date_id, enrollment_id")
        .eq("channel", "sms")
        .eq("status", "sent")
        .eq("reminder_kind", t.kind)
        .in("session_lesson_date_id", sldIds)
        .in("enrollment_id", enrollmentIds);
      for (const r of (sentRows || []) as any[]) {
        sentKeys.add(`${r.session_lesson_date_id}|${r.enrollment_id}`);
      }
    }

    for (const sld of firstLessonSlds as any[]) {
      const sess = sessionById.get(sld.session_id);
      if (!sess) continue;
      const timeStr = sess.start_time ? formatPTTime(sess.start_time) : "";
      const matching = (enrollments || []).filter((e: any) => e.session_id === sld.session_id);

      for (const e of matching as any[]) {
        const key = `${sld.id}|${e.id}`;
        if (sentKeys.has(key)) continue;

        const firstName = (e.child_name || "").split(" ")[0] || "Your swimmer";
        const message = `${firstName} has a swim lesson ${when} at ${timeStr} at Aquatic Dreams. See you there!`;
        const phone = normalizePhone(e.parent_phone);

        if (!phone) {
          failed++;
          await admin.from("reminder_logs").insert({
            swimmer_name: e.child_name, session_lesson_date_id: sld.id, enrollment_id: e.id,
            channel: "sms", reminder_kind: t.kind, phone: null, message,
            status: "failed", error: "no_phone",
          });
          continue;
        }

        const result = await sendSms(phone, message);
        await admin.from("reminder_logs").insert({
          swimmer_name: e.child_name, session_lesson_date_id: sld.id, enrollment_id: e.id,
          channel: "sms", reminder_kind: t.kind, phone, message,
          sent_at: result.ok ? new Date().toISOString() : null,
          status: result.ok ? "sent" : "failed",
          error: result.ok ? null : result.error,
        });
        if (result.ok) { if (t.kind === "group_48h") sent48++; else sent24++; }
        else failed++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent_48h: sent48, sent_24h: sent24, failed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
