import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-signature, svix-timestamp",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const event = await req.json();
    // Resend webhook payload: { type, created_at, data: { email_id, to, subject, ... } }
    const type: string = event?.type || "";
    const data = event?.data || {};
    const messageId: string | undefined = data.email_id || data.id;
    const to = Array.isArray(data.to) ? data.to[0] : data.to;

    const statusMap: Record<string, string> = {
      "email.sent": "sent",
      "email.delivered": "sent",
      "email.opened": "opened",
      "email.clicked": "clicked",
      "email.bounced": "bounced",
      "email.complained": "complained",
      "email.delivery_delayed": "queued",
      "email.failed": "failed",
    };
    const newStatus = statusMap[type];

    if (messageId && newStatus) {
      const updates: Record<string, unknown> = { status: newStatus };
      if (newStatus === "opened") updates.opened_at = new Date().toISOString();
      if (newStatus === "clicked") updates.clicked_at = new Date().toISOString();
      await supabase
        .from("marketing_campaign_recipients")
        .update(updates)
        .eq("resend_message_id", messageId);
    }

    // Suppress hard bounces + complaints
    if ((type === "email.bounced" || type === "email.complained") && to) {
      await supabase.from("suppressed_emails").insert({
        email: String(to).toLowerCase(),
        reason: type === "email.complained" ? "complaint" : "bounce",
        metadata: data,
      });
      await supabase
        .from("marketing_contacts")
        .update({ subscribed: false, unsubscribed_at: new Date().toISOString(), unsubscribe_reason: type })
        .eq("email", String(to).toLowerCase());
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
