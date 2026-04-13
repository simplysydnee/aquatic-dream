import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { priceIds, customerEmail, enrollmentId, returnUrl, environment } = await req.json();

    // Support multiple line items for session + registration fee
    const items: Array<{ priceId: string; quantity: number }> = [];
    if (Array.isArray(priceIds)) {
      for (const id of priceIds) {
        if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
          return new Response(JSON.stringify({ error: `Invalid priceId: ${id}` }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        items.push({ priceId: id, quantity: 1 });
      }
    } else {
      return new Response(JSON.stringify({ error: "priceIds must be an array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const env = (environment || 'sandbox') as StripeEnv;
    const stripe = createStripeClient(env);

    // Resolve all price IDs
    const lineItems = [];
    for (const item of items) {
      const prices = await stripe.prices.list({ lookup_keys: [item.priceId] });
      if (!prices.data.length) {
        return new Response(JSON.stringify({ error: `Price not found: ${item.priceId}` }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      lineItems.push({ price: prices.data[0].id, quantity: item.quantity });
    }

    const session = await stripe.checkout.sessions.create({
      line_items: lineItems,
      mode: "payment",
      ui_mode: "embedded",
      return_url: returnUrl || `${req.headers.get("origin")}/enroll?step=done&session_id={CHECKOUT_SESSION_ID}`,
      ...(customerEmail && { customer_email: customerEmail }),
      ...(enrollmentId && {
        metadata: { enrollmentId },
      }),
    });

    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
