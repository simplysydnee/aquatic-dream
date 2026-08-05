// TEMPORARY sandbox cleanup for the Phase 5 proof. Deleted right after use.
import { createStripeClient } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  const env = Deno.env.get("PAYMENTS_ENV");
  if (env !== "sandbox") {
    return new Response(JSON.stringify({ error: `refusing with PAYMENTS_ENV=${env}` }), { status: 400 });
  }
  const { subscriptionId, customerId } = await req.json();
  const stripe = createStripeClient("sandbox");
  const sub = await stripe.subscriptions.cancel(subscriptionId, { prorate: false });
  let customerDeleted = false;
  try {
    const del = await stripe.customers.del(customerId);
    customerDeleted = !!del.deleted;
  } catch (_e) {
    customerDeleted = false;
  }
  return new Response(JSON.stringify({ subscriptionStatus: sub.status, customerDeleted }), {
    headers: { "Content-Type": "application/json" },
  });
});
