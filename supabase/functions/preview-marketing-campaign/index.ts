import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { renderMarketingHtml, type MarketingBlock } from "../_shared/marketing-template.ts";
import { resolveAudience } from "../send-marketing-campaign/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();

    // Audience-only preview path (used by editor to live-count recipients)
    if (body.audience && !body.blocks) {
      const recipients = await resolveAudience(body.audience);
      return new Response(JSON.stringify({
        count: recipients.length,
        sample: recipients.slice(0, 10).map((r) => r.email),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const blocks = (body.blocks ?? []) as MarketingBlock[];
    const html = renderMarketingHtml({
      subject: body.subject || "Preview",
      preheader: body.preheader,
      blocks,
      unsubscribeUrl: "#preview-unsubscribe",
      companyName: body.companyName,
      companyAddress: body.companyAddress,
      logoUrl: body.logoUrl || `${SUPABASE_URL}/storage/v1/object/public/email-assets/aqd-email-logo.jpg`,
    });

    let audienceInfo: { count: number; sample: string[] } | undefined;
    if (body.audience) {
      try {
        const recipients = await resolveAudience(body.audience);
        audienceInfo = { count: recipients.length, sample: recipients.slice(0, 10).map((r) => r.email) };
      } catch (e) {
        console.error("audience preview failed", e);
      }
    }

    return new Response(JSON.stringify({ html, audience: audienceInfo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Reference SERVICE_ROLE so it's tree-shake-safe (resolveAudience uses its own client).
void SERVICE_ROLE; void createClient;
