import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { isCronAuthorized, unauthorizedResponse } from "../_shared/cron-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Only the service role (pg_cron) or CRON_INVOKE_SECRET may invoke.
  if (!isCronAuthorized(req)) return unauthorizedResponse(corsHeaders);


  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("marketing_campaigns")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .limit(20);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  for (const c of due || []) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/send-marketing-campaign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({ campaign_id: c.id }),
      });
      const j = await r.json();
      results.push({ id: c.id, ok: r.ok, ...j });
    } catch (e) {
      results.push({ id: c.id, ok: false, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
