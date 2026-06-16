import { createClient } from "npm:@supabase/supabase-js@2";

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

  const today = ptToday();

  const { data: alreadySent } = await admin
    .from("reminder_logs")
    .select("lesson_occurrence_id")
    .eq("channel", "sms")
    .eq("status", "sent")
    .eq("reminder_kind", "manual_today")
    .gte("created_at", `${today}T00:00:00-08:00`)
    .not("lesson_occurrence_id", "is", null);
  const sentIds = new Set((alreadySent || []).map((r: any) => r.lesson_occurrence_id));

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

  let sent = 0, failed = 0;
  const errors: Array<{ occurrence_id: string; error: string }> = [];

  for (const o of (occs || []) as any[]) {
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
      await admin.from("reminder_logs").insert({
        swimmer_name: b.child_name, lesson_occurrence_id: o.id, booking_id: b.id,
        channel: "sms", reminder_kind: "manual_today", phone: null, message,
        status: "failed", error: "no_phone",
      });
      continue;
    }

    const result = await sendSms(phone, message);
    await admin.from("reminder_logs").insert({
      swimmer_name: b.child_name, lesson_occurrence_id: o.id, booking_id: b.id,
      channel: "sms", reminder_kind: "manual_today", phone, message,
      sent_at: result.ok ? new Date().toISOString() : null,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.error,
    });
    if (result.ok) sent++;
    else { failed++; errors.push({ occurrence_id: o.id, error: result.error || "unknown" }); }
  }

  return new Response(JSON.stringify({ ok: true, sent, failed, errors, date: today }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
