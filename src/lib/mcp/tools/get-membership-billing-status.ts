import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function stripeKey(env: "live" | "sandbox"): string | null {
  const manual = process.env.STRIPE_API_KEY;
  const wantsLive = env === "live";
  if (manual && /^(sk|rk)_(test|live)_/.test(manual)) {
    const isLive = /^(sk|rk)_live_/.test(manual);
    if (isLive === wantsLive) return manual;
  }
  return env === "live"
    ? process.env.STRIPE_LIVE_API_KEY ?? null
    : process.env.STRIPE_SANDBOX_API_KEY ?? null;
}

async function stripeGet(env: "live" | "sandbox", path: string): Promise<any> {
  const key = stripeKey(env);
  if (!key) throw new Error(`No Stripe key configured for env=${env}`);
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Stripe ${env} ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export default defineTool({
  name: "get_membership_billing_status",
  title: "Get membership billing status",
  description:
    "Fetch live billing status from Stripe for a membership: subscription status, latest invoice status, and next charge date + amount. Defaults to the live environment; pass environment='sandbox' for test-mode subscriptions.",
  inputSchema: {
    id: z.string().uuid(),
    environment: z.enum(["live", "sandbox"]).default("live"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ id, environment }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = client(ctx);
    const { data: m, error } = await supabase
      .from("memberships")
      .select("id, stripe_subscription_id, stripe_customer_id, status, current_period_start, current_period_end")
      .eq("id", id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!m) return { content: [{ type: "text", text: "Membership not found" }], isError: true };
    if (!m.stripe_subscription_id) {
      const payload = {
        subscription_status: m.status,
        last_invoice_status: null,
        next_charge_date: m.current_period_end,
        next_charge_amount_cents: null,
        note: "No Stripe subscription linked to this membership.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    }

    try {
      const sub = await stripeGet(environment, `/subscriptions/${m.stripe_subscription_id}`);
      const latestInvoiceId = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
      const invoice = latestInvoiceId ? await stripeGet(environment, `/invoices/${latestInvoiceId}`) : null;

      const nextTs = sub.current_period_end ?? null;
      const item = sub.items?.data?.[0];
      const nextAmount = item?.price?.unit_amount ?? null;

      const payload = {
        subscription_id: sub.id,
        subscription_status: sub.status,
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
        current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
        current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        next_charge_date: nextTs ? new Date(nextTs * 1000).toISOString() : null,
        next_charge_amount_cents: nextAmount,
        last_invoice_status: invoice?.status ?? null,
        last_invoice_amount_paid_cents: invoice?.amount_paid ?? null,
        last_invoice_hosted_url: invoice?.hosted_invoice_url ?? null,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: (e as Error).message }],
        isError: true,
      };
    }
  },
});
