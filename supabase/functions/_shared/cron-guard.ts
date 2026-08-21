// Shared auth guard for cron-invoked edge functions.
//
// Accepts EITHER a service-role bearer token OR an x-cron-secret header that
// matches CRON_INVOKE_SECRET (or the legacy CRON_SECRET). Anon JWTs are never
// accepted: pg_net sends whatever header the job command builds, so the guard
// is the only thing standing between a public URL and a job that texts parents.
export function isCronAuthorized(req: Request): boolean {
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (serviceRole && bearer === serviceRole) return true;

  const provided = req.headers.get("x-cron-secret") || "";
  if (!provided) return false;
  const secrets = [Deno.env.get("CRON_INVOKE_SECRET"), Deno.env.get("CRON_SECRET")]
    .filter((v): v is string => !!v);
  return secrets.includes(provided);
}

export const cronCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

export function unauthorizedResponse(headers: Record<string, string> = cronCorsHeaders): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
