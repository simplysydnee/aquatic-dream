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
  const tomorrow = addDays(ptToday(), 1);

  const { data: occs, error: occErr } = await admin
    .from("lesson_booking_occurrences")
    .select(`id, occurrence_date, status, start_time_override,
             lesson_bookings!inner(id, status, lesson_type, child_name, child_first_name,
                                   parent_phone, partner_parent_phone, partner_swimmer_first_name,
                                   partner_swimmer_last_name, start_time)`)
    .eq("occurrence_date", tomorrow)
    .eq("status", "scheduled");

  if (occErr) {
    return new Response(JSON.stringify({ error: occErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const occIds = (occs || []).map((o: any) => o.id);
  let alreadyByOccPhone = new Set<string>();
  if (occIds.length) {
    const { data: sentRows } = await admin
      .from("reminder_logs")
      .select("lesson_occurrence_id, phone")
      .eq("channel", "sms")
      .eq("status", "sent")
      .eq("reminder_kind", "private_24h")
      .in("lesson_occurrence_id", occIds);
    alreadyByOccPhone = new Set(
      (sentRows || []).map((r: any) => `${r.lesson_occurrence_id}|${r.phone || ""}`)
    );
  }

  let sent = 0, failed = 0;

  async function trySend(o: any, b: any, firstName: string, phoneRaw: string | null) {
    const phone = normalizePhone(phoneRaw);
    const startTime = o.start_time_override || b.start_time;
    const timeStr = startTime ? formatPTTime(startTime) : "";
    const message = `${firstName} has a swim lesson tomorrow at ${timeStr} at Aquatic Dreams. See you there!`;
    const dedupeKey = `${o.id}|${phone || ""}`;
    if (alreadyByOccPhone.has(dedupeKey)) return;

    if (!phone) {
      failed++;
      await admin.from("reminder_logs").insert({
        swimmer_name: firstName, lesson_occurrence_id: o.id, booking_id: b.id,
        channel: "sms", reminder_kind: "private_24h", phone: null, message,
        status: "failed", error: "no_phone",
      });
      return;
    }

    const result = await sendSms(phone, message);
    await admin.from("reminder_logs").insert({
      swimmer_name: firstName, lesson_occurrence_id: o.id, booking_id: b.id,
      channel: "sms", reminder_kind: "private_24h", phone, message,
      sent_at: result.ok ? new Date().toISOString() : null,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.error,
    });
    if (result.ok) sent++; else failed++;
  }

  for (const o of (occs || []) as any[]) {
    const b = o.lesson_bookings;
    if (!b) continue;
    if (b.status === "cancelled") continue;
    if (!["private", "semi-private"].includes(b.lesson_type)) continue;

    const primaryFirst = b.child_first_name || (b.child_name || "").split(" ")[0] || "Your swimmer";
    await trySend(o, b, primaryFirst, b.parent_phone);

    if (b.lesson_type === "semi-private" && b.partner_parent_phone) {
      const partnerFirst = b.partner_swimmer_first_name
        || (b.partner_swimmer_last_name ? "" : "")
        || "Your swimmer";
      await trySend(o, b, partnerFirst || "Your swimmer", b.partner_parent_phone);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, failed, date: tomorrow }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
