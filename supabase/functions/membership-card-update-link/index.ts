// Admin-only: send the parent a secure Stripe card update page for ONE
// membership, and return the URL so the front desk can read it out on the
// phone. Saving the card is finished by payments-webhook, which attaches it
// and retries the open invoice.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createStripeClient, type StripeEnv } from "../_shared/stripe.ts";
import { sendSms, normalizePhone } from "../_shared/textmagic.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SITE_URL = "https://aquaticdreamsswim.com";
const RATE_LIMIT_MINUTES = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return json({ error: guard.error }, guard.status);

    const body = await req.json();
    const membershipId = String(body?.membership_id || "");
    const channels: string[] = Array.isArray(body?.channels) ? body.channels : ["sms", "email"];
    if (!membershipId) return json({ error: "membership_id required" }, 400);

    const configuredEnv = Deno.env.get("PAYMENTS_ENV");
    if (configuredEnv !== "live" && configuredEnv !== "sandbox") {
      return json({ error: "Payments are not configured" }, 500);
    }
    const env: StripeEnv = configuredEnv;

    const { data: membership, error } = await supabaseAdmin
      .from("memberships")
      .select(
        "id, parent_first_name, parent_last_name, parent_email, parent_phone, child_first_name, child_last_name, stripe_customer_id, card_link_sent_at",
      )
      .eq("id", membershipId)
      .maybeSingle();
    if (error) {
      console.error("[membership-card-update-link] load failed", error.message);
      return json({ error: "Could not load the membership" }, 500);
    }
    if (!membership) return json({ error: "Membership not found" }, 404);

    if (membership.card_link_sent_at) {
      const sinceMin = (Date.now() - new Date(membership.card_link_sent_at as string).getTime()) / 60000;
      if (sinceMin < RATE_LIMIT_MINUTES) {
        const wait = Math.max(1, Math.ceil(RATE_LIMIT_MINUTES - sinceMin));
        return json({ error: `A card link already went out. Try again in ${wait} min.`, rate_limited: true }, 429);
      }
    }

    const stripe = createStripeClient(env);
    const parentEmail = (membership.parent_email as string | null) || "";
    let customerId = membership.stripe_customer_id as string | null;
    if (!customerId) {
      const existing = parentEmail ? await stripe.customers.list({ email: parentEmail, limit: 1 }) : { data: [] };
      customerId = existing.data[0]?.id
        ?? (await stripe.customers.create({
          email: parentEmail || undefined,
          name: `${membership.parent_first_name ?? ""} ${membership.parent_last_name ?? ""}`.trim() || undefined,
          phone: (membership.parent_phone as string | null) || undefined,
        })).id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      ui_mode: "hosted_page",
      customer: customerId,
      currency: "usd",
      payment_method_types: ["card"],
      success_url: `${SITE_URL}/?card_saved=1`,
      cancel_url: `${SITE_URL}/`,
      expires_at: Math.floor(Date.now() / 1000) + 23 * 60 * 60,
      metadata: { type: "membership_card_update", membership_id: membershipId },
    });
    if (!session.url) return json({ error: "Stripe returned no URL" }, 502);

    const swimmer = `${membership.child_first_name ?? ""}`.trim();
    const message =
      `Aquatic Dreams: your card on file for ${swimmer || "your swimmer"}'s monthly payment was declined. ` +
      `Update it here and we'll take care of the rest: ${session.url}`;

    const sent = { sms: false, email: false };
    const phone = normalizePhone(membership.parent_phone as string | null);
    if (channels.includes("sms") && phone) {
      const res = await sendSms(phone, message, { admin: supabaseAdmin, kind: "card_update", sentByLabel: "System - card update link" });
      sent.sms = res.ok;
      if (!res.ok) console.error("[membership-card-update-link] sms failed", res.error);
    }
    if (channels.includes("email") && parentEmail) {
      const { error: emailErr } = await supabaseAdmin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "admin-freeform",
          recipientEmail: parentEmail,
          idempotencyKey: `membership-card-${membershipId}-${Date.now()}`,
          templateData: {
            parentName: membership.parent_first_name,
            subject: "Update your card on file",
            body:
              `The card we have on file for ${swimmer || "your swimmer"}'s monthly payment was declined.\n\n` +
              `Update it here (secure Stripe page):\n${session.url}\n\n` +
              `Your swimmer stays enrolled. Once the new card is saved we'll take care of the balance.`,
          },
        },
      });
      sent.email = !emailErr;
      if (emailErr) console.error("[membership-card-update-link] email failed", emailErr);
    }

    await supabaseAdmin
      .from("memberships")
      .update({ stripe_customer_id: customerId, card_link_sent_at: new Date().toISOString() })
      .eq("id", membershipId);

    return json({ success: true, url: session.url, sent, message });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[membership-card-update-link] failed", msg);
    return json({ error: msg }, 500);
  }
});

async function requireAdmin(req: Request): Promise<{ ok: boolean; status: number; error?: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { ok: false, status: 401, error: "Missing Authorization header" };
  const { data, error } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !data?.user) return { ok: false, status: 401, error: "Invalid auth token" };
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
  if (!isAdmin) return { ok: false, status: 403, error: "Admin role required" };
  return { ok: true, status: 200 };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
