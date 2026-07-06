// Send a "session starts next week" SMS to parents in a session period.
// Deduped by normalized parent phone: multi-swimmer families get one message.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  normalizePhone,
  sendSms,
  logSms,
  formatPTTime,
  formatPTDate,
} from "../_shared/textmagic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const DAY_NAMES = [
  "Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (claimsErr || !userId) return json(401, { error: "Unauthorized" });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userId, _role: "admin",
    });
    if (!isAdmin) return json(403, { error: "Forbidden" });

    const { sessionPeriodId } = await req.json();
    if (!sessionPeriodId) return json(400, { error: "sessionPeriodId required" });

    const { data: period } = await admin
      .from("session_periods")
      .select("id, name, start_date, end_date")
      .eq("id", sessionPeriodId)
      .maybeSingle();
    if (!period) return json(404, { error: "Session period not found" });

    const { data: enrollments, error: enrErr } = await admin
      .from("swim_enrollments")
      .select("id, parent_phone, child_name, child_first_name, swim_sessions!inner(session_period_id, day_of_week, start_time)")
      .in("status", ["confirmed","enrolled","pending_payment"])
      .eq("swim_sessions.session_period_id", sessionPeriodId);
    if (enrErr) return json(500, { error: enrErr.message });

    // Skip anything already sent for this period
    const { data: alreadySent } = await admin
      .from("reminder_logs")
      .select("phone")
      .eq("channel", "sms")
      .eq("status", "sent")
      .eq("reminder_kind", "session_welcome_sms")
      .like("message", `%${period.start_date}%`);
    const sentPhones = new Set((alreadySent || []).map((r: any) => r.phone));

    // Group by normalized phone
    const groups = new Map<string, { firstNames: string[]; firstDay?: string; firstTime?: string; enrollmentIds: string[] }>();
    for (const e of (enrollments || []) as any[]) {
      const phone = normalizePhone(e.parent_phone);
      if (!phone) continue;
      if (!groups.has(phone)) groups.set(phone, { firstNames: [], enrollmentIds: [] });
      const g = groups.get(phone)!;
      const first = (e.child_first_name || (e.child_name || "").split(" ")[0] || "").trim();
      if (first && !g.firstNames.includes(first)) g.firstNames.push(first);
      g.enrollmentIds.push(e.id);
      const s = e.swim_sessions;
      if (s?.day_of_week !== undefined && s?.day_of_week !== null && !g.firstDay) {
        // day_of_week is numeric 0-6 in this schema? Check text or number.
        const dow = s.day_of_week;
        if (typeof dow === "number") g.firstDay = DAY_NAMES[dow];
        else if (typeof dow === "string") g.firstDay = dow.charAt(0).toUpperCase() + dow.slice(1);
      }
      if (s?.start_time && !g.firstTime) g.firstTime = formatPTTime(s.start_time);
    }

    const startDateFmt = formatPTDate(period.start_date, { weekday: "short", month: "short", day: "numeric" });

    let sent = 0, failed = 0, skipped = 0;
    const results: any[] = [];

    for (const [phone, g] of groups) {
      if (sentPhones.has(phone)) { skipped++; continue; }

      let message: string;
      if (g.firstNames.length <= 1) {
        const name = g.firstNames[0] || "Your swimmer";
        const timePart = g.firstDay && g.firstTime ? ` First lesson ${g.firstDay} at ${g.firstTime}.` : "";
        message = `Hi! ${name}'s next swim session starts ${startDateFmt} at Aquatic Dreams.${timePart} We emailed full details — check spam if you don't see it! Reply STOP to opt out.`;
      } else {
        const list = g.firstNames.join(" & ");
        message = `Hi! Your swimmers (${list}) start their next session ${startDateFmt} at Aquatic Dreams. First lessons this week — check your email (and spam) for the full schedule. Reply STOP to opt out.`;
      }

      const result = await sendSms(phone, message);
      await logSms(admin, {
        swimmer_name: g.firstNames.join(", ") || null,
        enrollment_id: g.enrollmentIds[0] || null,
        phone,
        message,
        status: result.ok ? "sent" : "failed",
        error: result.ok ? null : result.error ?? null,
        reminder_kind: "session_welcome_sms",
      });
      if (result.ok) sent++; else failed++;
      results.push({ phone, ok: result.ok, error: result.error ?? null });
    }

    return json(200, { ok: true, sent, failed, skipped, total: groups.size, period: period.name });
  } catch (e) {
    console.error("send-session-welcome-sms error:", e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
