// TEMPORARY read-only audit: lists Stripe invoices for the duplicate
// membership subscriptions so we can decide refunds before any cleanup.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createStripeClient, type StripeEnv } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token ?? "");
    if (!user) throw new Error("Unauthorized");
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const envValue = Deno.env.get("PAYMENTS_ENV");
    if (envValue !== "live" && envValue !== "sandbox") {
      throw new Error("PAYMENTS_ENV is not set to live or sandbox");
    }
    const stripe = createStripeClient(envValue as StripeEnv);

    const { subscriptionIds } = await req.json() as { subscriptionIds: string[] };
    const results: unknown[] = [];

    for (const subId of subscriptionIds) {
      const sub = await stripe.subscriptions.retrieve(subId);
      const invoices = await stripe.invoices.list({ subscription: subId, limit: 100 });
      results.push({
        subscription_id: subId,
        status: sub.status,
        trial_end: sub.trial_end,
        customer: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
        invoices: invoices.data.map((inv) => ({
          id: inv.id,
          status: inv.status,
          amount_due: inv.amount_due,
          amount_paid: inv.amount_paid,
          currency: inv.currency,
          created: inv.created,
          charge: (inv as unknown as { charge?: string | null }).charge ?? null,
          payment_intent: (inv as unknown as { payment_intent?: string | null }).payment_intent ?? null,
        })),
      });
    }

    return new Response(JSON.stringify({ environment: envValue, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
