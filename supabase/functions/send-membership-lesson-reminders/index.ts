// Automated 24h lesson reminders. Cron-invoked (pg_cron) with either the
// service-role bearer or x-cron-secret matching CRON_INVOKE_SECRET.
// All selection logic lives in _shared/lesson-reminders.ts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { ptDate, runLessonReminders } from "../_shared/lesson-reminders.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const providedSecret = req.headers.get("x-cron-secret") || "";
  const secrets = [Deno.env.get("CRON_INVOKE_SECRET"), Deno.env.get("CRON_SECRET")].filter(
    (v): v is string => !!v,
  );
  const isServiceRole = !!bearer && bearer === SERVICE_ROLE;
  const isCronSecret = !!providedSecret && secrets.includes(providedSecret);
  if (!isServiceRole && !isCronSecret) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as { dryRun?: boolean; date?: string };
  const dryRun = body?.dryRun === true;
  // 24h ahead in Pacific.
  const targetDate = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : ptDate(1);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_ROLE);

  try {
    const result = await runLessonReminders(
      admin,
      targetDate,
      "lesson_24h",
      dryRun,
      "System - 24h reminder",
    );
    return json({ ok: true, ...result });
  } catch (e) {
    console.error("send-membership-lesson-reminders failed", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
