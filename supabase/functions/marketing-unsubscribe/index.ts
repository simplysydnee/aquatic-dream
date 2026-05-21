import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function htmlPage(title: string, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#F7F3EE;margin:0;padding:48px 16px;color:#1f2937;}
.card{max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.05);text-align:center;}
h1{color:#2a5e84;margin:0 0 12px;font-size:22px;}
p{line-height:1.6;}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // POST = perform unsubscribe (used by RFC 8058 List-Unsubscribe-Post and our public page)
  if (req.method === "POST") {
    if (!token) return new Response("missing token", { status: 400, headers: corsHeaders });
    const { data, error } = await supabase.rpc("unsubscribe_marketing_by_token", { _token: token });
    if (error) return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    return new Response(JSON.stringify({ ok: true, email: data?.[0]?.email, already: data?.[0]?.already }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // GET = serve HTML confirmation page (browser flow)
  if (!token) {
    return new Response(htmlPage("Missing link", "This unsubscribe link is incomplete."), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "text/html" },
    });
  }
  const { data, error } = await supabase.rpc("unsubscribe_marketing_by_token", { _token: token });
  if (error) {
    return new Response(htmlPage("Link not found", "This unsubscribe link is no longer valid."), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "text/html" },
    });
  }
  const email = data?.[0]?.email ?? "";
  return new Response(
    htmlPage("You're unsubscribed", `<strong>${email}</strong> won't receive any more marketing emails from Aquatic Dreams. You'll still get transactional emails like waivers and receipts.`),
    { headers: { ...corsHeaders, "Content-Type": "text/html" } },
  );
});
