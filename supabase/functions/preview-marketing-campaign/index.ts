import { renderMarketingHtml, type MarketingBlock } from "../_shared/marketing-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const blocks = (body.blocks ?? []) as MarketingBlock[];
    const html = renderMarketingHtml({
      subject: body.subject || "Preview",
      preheader: body.preheader,
      blocks,
      unsubscribeUrl: "#preview-unsubscribe",
      companyName: body.companyName,
      companyAddress: body.companyAddress,
      logoUrl: body.logoUrl,
    });
    return new Response(JSON.stringify({ html }), {
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
