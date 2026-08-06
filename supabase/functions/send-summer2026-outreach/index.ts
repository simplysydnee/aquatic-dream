// Admin-only manual send for the summer 2026 to fall Swimbership announcement.
// One segment per call, fired by explicit admin action. Never scheduled, never
// wired to a webhook or cron. Re-running skips phones already texted.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendSms, logSms, normalizePhone } from "../_shared/textmagic.ts";
import { buildSummer2026List, SUMMER2026_KIND, type Segment } from "../_shared/summer2026-outreach.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SEGMENTS: Segment[] = ["GROUP", "PRIVATE", "BOTH"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) return json({ error: "Invalid auth token" }, 401);
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Admin role required" }, 403);

    const body = await req.json().catch(() => ({}));
    const segment = String(body?.segment || "").toUpperCase() as Segment;
    if (!SEGMENTS.includes(segment)) {
      return json({ error: "segment must be GROUP, PRIVATE, or BOTH" }, 400);
    }
    if (body?.confirm !== true) {
      return json({ error: "confirm must be true to send" }, 400);
    }
    const limit = Number.isFinite(body?.limit) ? Math.max(1, Number(body.limit)) : null;

    const list = await buildSummer2026List(supabaseAdmin);

    const { data: alreadySent } = await supabaseAdmin
      .from("reminder_logs")
      .select("phone")
      .eq("reminder_kind", SUMMER2026_KIND)
      .eq("status", "sent");
    const sentPhones = new Set(
      (alreadySent ?? []).map((r: { phone: string | null }) => (r.phone ?? "").replace(/\D/g, "").slice(-10)),
    );

    let targets = list.recipients.filter((r) => r.segment === segment && !sentPhones.has(r.phone));
    if (limit) targets = targets.slice(0, limit);

    let sent = 0;
    let failed = 0;
    const errors: { phone: string; error: string }[] = [];

    // Pace sends so a whole segment does not hit TextMagic in one burst.
    const PACING_MS = Number.isFinite(body?.pacing_ms)
      ? Math.min(10000, Math.max(0, Number(body.pacing_ms)))
      : 1500;
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    for (let i = 0; i < targets.length; i++) {
      const r = targets[i];
      if (i > 0 && PACING_MS > 0) await sleep(PACING_MS);
      const phone = normalizePhone(r.phone);

      if (!phone) {
        failed++;
        continue;
      }
      const result = await sendSms(phone, r.message);
      await logSms(supabaseAdmin, {
        swimmer_name: r.childNames.join(", "),
        phone,
        message: r.message,
        status: result.ok ? "sent" : "failed",
        error: result.ok ? null : result.error ?? null,
        reminder_kind: SUMMER2026_KIND,
      });
      if (result.ok) sent++;
      else {
        failed++;
        errors.push({ phone, error: result.error ?? "unknown" });
      }
    }

    return json({
      segment,
      attempted: targets.length,
      sent,
      failed,
      skipped_already_sent: list.recipients.filter((r) => r.segment === segment && sentPhones.has(r.phone)).length,
      errors: errors.slice(0, 20),
    });
  } catch (e) {
    console.error("[send-summer2026-outreach]", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
