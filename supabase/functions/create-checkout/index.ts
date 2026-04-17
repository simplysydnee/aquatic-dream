import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { enrollmentIds, customerEmail, returnUrl, environment } = await req.json();

    if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
      return new Response(JSON.stringify({ error: "enrollmentIds must be a non-empty array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate UUID format
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of enrollmentIds) {
      if (typeof id !== "string" || !uuidRe.test(id)) {
        return new Response(JSON.stringify({ error: `Invalid enrollmentId: ${id}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Server-authoritative pricing: query DB for each enrollment
    const { data: enrollments, error: fetchErr } = await supabaseAdmin
      .from("swim_enrollments")
      .select("id, is_first_time")
      .in("id", enrollmentIds);

    if (fetchErr || !enrollments || enrollments.length === 0) {
      return new Response(JSON.stringify({ error: "Enrollments not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build line items from DB truth
    // - First-time child: 1× registration_fee (session deferred)
    // - Returning child: 1× swim_session_fee per enrollment row
    const lookupKeys: string[] = [];
    for (const e of enrollments) {
      if (e.is_first_time) {
        lookupKeys.push("registration_fee");
      } else {
        lookupKeys.push("swim_session_fee");
      }
    }

    const env = (environment || "sandbox") as StripeEnv;
    const stripe = createStripeClient(env);

    // Resolve unique lookup keys
    const uniqueKeys = [...new Set(lookupKeys)];
    const prices = await stripe.prices.list({ lookup_keys: uniqueKeys });
    const priceMap: Record<string, string> = {};
    for (const p of prices.data) {
      if (p.lookup_key) priceMap[p.lookup_key] = p.id;
    }
    for (const key of uniqueKeys) {
      if (!priceMap[key]) {
        return new Response(JSON.stringify({ error: `Price not found: ${key}` }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const lineItems = lookupKeys.map((key) => ({
      price: priceMap[key],
      quantity: 1,
    }));

    const session = await stripe.checkout.sessions.create({
      line_items: lineItems,
      mode: "payment",
      ui_mode: "embedded",
      return_url: returnUrl || `${req.headers.get("origin")}/swim-enrollment?step=done&session_id={CHECKOUT_SESSION_ID}`,
      ...(customerEmail && { customer_email: customerEmail }),
      metadata: { enrollmentIds: enrollmentIds.join(",") },
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
