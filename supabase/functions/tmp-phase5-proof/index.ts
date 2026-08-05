// TEMPORARY sandbox verification for the saved-card membership path.
// Deleted immediately after the Phase 5 proof run.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createStripeClient } from "../_shared/stripe.ts";
import { resolveParentStripeCustomer } from "../_shared/stripe-customer.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const env = Deno.env.get("PAYMENTS_ENV");
  if (env !== "sandbox") {
    return new Response(JSON.stringify({ error: `refusing to run with PAYMENTS_ENV=${env}` }), { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "phase5.proof@example.com").toLowerCase();
  const stripe = createStripeClient("sandbox");

  // 1. Resolve (or create) the one customer for this email, twice, and prove
  //    both calls land on the same customer id.
  const first = await resolveParentStripeCustomer(stripe, { email, name: "Phase Five", phone: "+12095550123" });
  // 2. Attach a test card and make it the default, as a prior enrollment would.
  const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
  await stripe.paymentMethods.attach(pm.id, { customer: first.customerId });
  await stripe.customers.update(first.customerId, { invoice_settings: { default_payment_method: pm.id } });

  const second = await resolveParentStripeCustomer(stripe, { email, name: "Phase Five", phone: "+12095550123" });

  // 3. Mint the reuse token exactly as lookup-parent-card-on-file-public does.
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await supabase.from("card_reuse_tokens").insert({
    token,
    parent_email: email,
    stripe_customer_id: second.customerId,
    stripe_payment_method_id: second.savedCard?.paymentMethodId ?? pm.id,
    brand: second.savedCard?.brand ?? null,
    last4: second.savedCard?.last4 ?? null,
    exp_month: second.savedCard?.expMonth ?? null,
    exp_year: second.savedCard?.expYear ?? null,
  });

  return new Response(JSON.stringify({
    customerFirst: first.customerId,
    customerSecond: second.customerId,
    sameCustomer: first.customerId === second.customerId,
    duplicates: second.duplicateCustomerIds,
    savedCard: second.savedCard,
    reuse_token: token,
  }), { headers: { "Content-Type": "application/json" } });
});
