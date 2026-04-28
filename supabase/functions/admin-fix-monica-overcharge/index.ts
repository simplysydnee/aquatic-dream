// One-off admin script to:
//   1. Refund $80 to Monica Prieto on cs_live_b1xy...
//   2. Sync the live Stripe price for lookup_key='swim_session_fee' to $240
//   3. Stamp refund details on her two enrollment rows
//
// Invoke once with POST {} (admin auth required).
import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHECKOUT_SESSION_ID = "cs_live_b1xyOr74R9PdpjlSAKrIocC8SXqV1CXbq7cWTtJorrZXGoL7WZC6DL7VAO";
const REFUND_CENTS = 8000; // $80
const TARGET_PRICE_CENTS = 24000; // $240
const ENROLLMENT_IDS = [
  "b8985e08-0884-4bd3-8dc4-8bea97e86217",
  "34c143e2-7fc5-41ee-bbaf-175ab2e483da",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  // Admin auth check
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const token = authHeader.replace("Bearer ", "");
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData?.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
  if (!roleRow) return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const stripe = createStripeClient("live");
  const result: Record<string, unknown> = {};

  try {
    // 1. Retrieve the checkout session to get the payment_intent
    const session = await stripe.checkout.sessions.retrieve(CHECKOUT_SESSION_ID);
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (!paymentIntentId) throw new Error("No payment_intent on session");
    result.paymentIntent = paymentIntentId;
    result.amountTotal = session.amount_total;

    // 2. Check for existing refunds (idempotency)
    const existingRefunds = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 10 });
    const alreadyRefunded = existingRefunds.data.reduce((sum, r) => sum + (r.amount || 0), 0);
    result.existingRefundedCents = alreadyRefunded;

    let refund;
    if (alreadyRefunded >= REFUND_CENTS) {
      result.refundSkipped = "already refunded";
      refund = existingRefunds.data[0];
    } else {
      refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: REFUND_CENTS,
        reason: "requested_by_customer",
        metadata: {
          reason_detail: "Overcharge fix: charged $280/session, should have been $240/session",
          enrollment_ids: ENROLLMENT_IDS.join(","),
        },
      });
      result.refundCreated = { id: refund.id, amount: refund.amount, status: refund.status };
    }

    // 3. Stamp refund onto both enrollment rows
    const refundAmountPerRow = REFUND_CENTS / 2 / 100; // $40 each
    for (const enrollmentId of ENROLLMENT_IDS) {
      await supabase
        .from("swim_enrollments")
        .update({
          session_fee_refund_stripe_id: refund.id,
          session_fee_refund_amount: refundAmountPerRow,
          session_fee_refund_at: new Date().toISOString(),
          session_fee_refund_reason: "Overcharge: $280 charged, should have been $240",
        })
        .eq("id", enrollmentId);
    }
    result.enrollmentsStamped = ENROLLMENT_IDS.length;

    // 4. Sync the swim_session_fee price to $240 (create new price + transfer lookup_key)
    const existingPrices = await stripe.prices.list({ lookup_keys: ["swim_session_fee"], limit: 10 });
    const currentPrice = existingPrices.data[0];
    result.currentPrice = currentPrice ? { id: currentPrice.id, unit_amount: currentPrice.unit_amount, product: currentPrice.product } : null;

    if (currentPrice && currentPrice.unit_amount !== TARGET_PRICE_CENTS) {
      const productId = typeof currentPrice.product === "string" ? currentPrice.product : currentPrice.product?.id;
      if (!productId) throw new Error("Could not resolve product id from current price");

      // Create new price at $240 with transfer_lookup_key so it inherits the lookup_key
      const newPrice = await stripe.prices.create({
        product: productId,
        unit_amount: TARGET_PRICE_CENTS,
        currency: currentPrice.currency || "usd",
        lookup_key: "swim_session_fee",
        transfer_lookup_key: true,
      });
      // Archive the old price
      await stripe.prices.update(currentPrice.id, { active: false });
      result.newPrice = { id: newPrice.id, unit_amount: newPrice.unit_amount };
    } else if (currentPrice?.unit_amount === TARGET_PRICE_CENTS) {
      result.priceSyncSkipped = "already $240";
    }

    return new Response(JSON.stringify({ ok: true, ...result }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-fix-monica-overcharge error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message, partial: result }, null, 2), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
