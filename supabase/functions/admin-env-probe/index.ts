// TEMPORARY diagnostic — returns only the PAYMENTS_ENV value. Delete in step 5.3.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(
    JSON.stringify({ payments_env: Deno.env.get("PAYMENTS_ENV") ?? null }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
