import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { completeMembershipFromSetupSessionId } from "../_shared/membership-completion.ts";

type StripeEnv = "sandbox" | "live";

const sessionIdRe = /^cs_(test|live)_[A-Za-z0-9]+$/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
    if (!sessionIdRe.test(sessionId)) return json({ error: "Invalid checkout session" }, 400);

    // /join is intentionally pinned to sandbox until the deliberate go-live step.
    const environment: StripeEnv = "sandbox";
    const result = await completeMembershipFromSetupSessionId(sessionId, environment);
    return json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[confirm-membership-checkout] failed", message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}