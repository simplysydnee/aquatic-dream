import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
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

    // Derive the environment from the session id itself so live sessions
    // are always completed with the live keys.
    const environment: StripeEnv = sessionId.startsWith("cs_live_") ? "live" : "sandbox";

    const result = await completeMembershipFromSetupSessionId(sessionId, environment);

    let manageToken: string | null = null;
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data } = await supabase
        .from("memberships")
        .select("manage_token")
        .eq("id", result.membershipId)
        .maybeSingle();
      manageToken = (data?.manage_token as string | null) ?? null;
    } catch (e) {
      console.error("[confirm-membership-checkout] manage_token lookup failed", e);
    }

    return json({ success: true, manageToken, ...result });
  } catch (error) {
    if (error instanceof MembershipCompletionInProgressError) {
      console.log("[confirm-membership-checkout] still finalizing", error.pendingId);
      return json({ pending: true, reason: "in_progress" }, 202);
    }
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