// Public, secret-free read of the payments environment.
//
// /join uses this to close itself whenever the backend is not pointed at
// live Stripe. The gate then reads the same variable the risk comes from,
// so a sandbox flip cannot leave public enrollment reachable.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const raw = Deno.env.get("PAYMENTS_ENV");
  const environment = raw === "live" ? "live" : raw === "sandbox" ? "sandbox" : "unconfigured";

  return new Response(JSON.stringify({ environment, live: environment === "live" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
