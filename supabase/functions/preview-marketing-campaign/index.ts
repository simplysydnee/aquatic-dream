import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { renderMarketingHtml, type MarketingBlock } from "../_shared/marketing-template.ts";
import { resolveAudience } from "../_shared/resolve-audience.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Admin-only — function returns marketing contact emails in audience samples.
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    if (!bearer) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    // Audience-only path
    if (body.audience && !body.blocks) {
      const recipients = await resolveAudience(supabase, body.audience);
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
        const recipients = await resolveAudience(supabase, body.audience);
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
