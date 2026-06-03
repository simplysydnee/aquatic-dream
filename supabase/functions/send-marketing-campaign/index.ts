import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { renderMarketingHtml, renderPlainText, type MarketingBlock } from "../_shared/marketing-template.ts";
import { resolveAudience } from "../_shared/resolve-audience.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const DEFAULT_FROM = Deno.env.get("MARKETING_FROM_ADDRESS")
  || "Aquatic Dreams <info@aquaticdreamsswim.com>";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  if (!auth) return false;
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

// resolveAudience moved to ../_shared/resolve-audience.ts


async function getSuppressed(): Promise<Set<string>> {
  const out = new Set<string>();
  const { data } = await supabase.from("suppressed_emails").select("email");
  (data || []).forEach((r: any) => out.add(String(r.email).toLowerCase()));
  return out;
}

async function getOrCreateToken(email: string): Promise<string> {
  const { data } = await supabase.rpc("get_or_create_unsubscribe_token", { _email: email });
  return data as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const body = await req.json();
    const campaignId: string | undefined = body.campaign_id;
    const testEmail: string | undefined = body.test_email;

    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaign_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Skip admin auth check when invoked via service-role (cron). Otherwise enforce.
    const auth = req.headers.get("Authorization") || "";
    const isServiceRole = auth.includes(SERVICE_ROLE);
    if (!isServiceRole && !(await isAdmin(req))) {
      return new Response(JSON.stringify({ error: "forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: campaign, error: cErr } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("id", campaignId)
      .maybeSingle();
    if (cErr || !campaign) throw new Error("campaign not found");

    if (!testEmail && campaign.status === "sent") {
      return new Response(JSON.stringify({ error: "already sent" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const blocks: MarketingBlock[] = (campaign.body_blocks || []) as MarketingBlock[];
    const fromAddress = campaign.from_address || DEFAULT_FROM;
    const replyTo = campaign.reply_to || undefined;
    const subject = campaign.subject || campaign.name;

    const unsubBase = `${SUPABASE_URL}/functions/v1/marketing-unsubscribe`;

    const renderFor = (email: string) => {
      const tokenUrl = `${unsubBase}?token=__TOKEN__`;
      return tokenUrl;
    };

    // Build recipient list
    let recipients: Array<{ id: string | null; email: string; first_name: string | null }>;
    if (testEmail) {
      recipients = [{ id: null, email: testEmail, first_name: null }];
    } else {
      recipients = await resolveAudience(supabase, campaign.audience);
    }
    const suppressed = await getSuppressed();
    recipients = recipients.filter((r) => !suppressed.has(r.email.toLowerCase()));

    if (recipients.length === 0) {
      await supabase.from("marketing_campaigns").update({
        status: testEmail ? campaign.status : "sent",
        sent_at: testEmail ? campaign.sent_at : new Date().toISOString(),
        sent_count: 0,
      }).eq("id", campaignId);
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!testEmail) {
      await supabase.from("marketing_campaigns").update({ status: "sending" }).eq("id", campaignId);
    }

    let sent = 0, failed = 0;

    for (const r of recipients) {
      const token = await getOrCreateToken(r.email);
      const unsubscribeUrl = `${unsubBase}?token=${token}`;
      const html = renderMarketingHtml({
        subject,
        preheader: campaign.preheader || undefined,
        blocks,
        unsubscribeUrl,
        companyName: "Aquatic Dreams",
        companyAddress: "Aquatic Dreams, Modesto, CA",
        logoUrl: `${SUPABASE_URL}/storage/v1/object/public/email-assets/aqd-email-logo.jpg`,
      });
      const text = renderPlainText({
        subject, preheader: campaign.preheader || undefined, blocks, unsubscribeUrl,
      });

      try {
        const resp = await fetch(`${GATEWAY_URL}/emails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": RESEND_API_KEY,
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [r.email],
            subject,
            html,
            text,
            reply_to: replyTo,
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:unsubscribe@aquaticdreamsswim.com?subject=unsubscribe>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
            tags: [
              { name: "campaign_id", value: String(campaignId).slice(0, 32) },
              { name: "type", value: testEmail ? "test" : "campaign" },
            ],
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.message || `Resend ${resp.status}`);

        if (!testEmail) {
          await supabase.from("marketing_campaign_recipients").insert({
            campaign_id: campaignId,
            contact_id: r.id,
            email: r.email,
            status: "sent",
            resend_message_id: data?.id,
            sent_at: new Date().toISOString(),
          });
          if (r.id) {
            await supabase.from("marketing_contacts")
              .update({ last_sent_at: new Date().toISOString() })
              .eq("id", r.id);
          }
        }
        sent++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        if (!testEmail) {
          await supabase.from("marketing_campaign_recipients").insert({
            campaign_id: campaignId,
            contact_id: r.id,
            email: r.email,
            status: "failed",
            error: msg,
          });
        }
        console.error("send failed", r.email, msg);
      }
      // gentle throttle to avoid rate limits
      await new Promise((res) => setTimeout(res, 80));
    }

    if (!testEmail) {
      await supabase.from("marketing_campaigns").update({
        status: failed === recipients.length ? "failed" : "sent",
        sent_at: new Date().toISOString(),
        sent_count: sent,
        failed_count: failed,
      }).eq("id", campaignId);
    }

    return new Response(JSON.stringify({ ok: true, sent, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("send-marketing-campaign error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
