import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createStripeClient } from "../_shared/stripe.ts";
import { computeMembershipQuote } from "../_shared/membership-pricing.ts";

type StripeEnv = "sandbox" | "live";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emailRe = /^\S+@\S+\.\S+$/;



serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      plan_key,
      standing_slot_id,
      child_first_name,
      child_last_name,
      child_dob,
      swim_level,
      parent_first_name,
      parent_last_name,
      parent_name,
      parent_email,
      parent_phone,
      is_first_time,
      has_medical,
      medical_notes,
      notes,
      waiver_id,
      recurring_consent,
      recurring_consent_version,
      membership_agreement_version,
      membership_agreement_text,
      membership_agreement_accepted,
      sms_consent,
      sms_consent_text,
      sms_consent_version,
      returnUrl,
      environment,
    } = body ?? {};

    const ENV: StripeEnv = environment === "sandbox" ? "sandbox" : "live";

    if (!["kid_group", "private", "adult_group"].includes(plan_key)) {
      return json({ error: "Invalid plan_key" }, 400);
    }
    if (typeof standing_slot_id !== "string" || !uuidRe.test(standing_slot_id)) {
      return json({ error: "Invalid standing_slot_id" }, 400);
    }
    if (!child_first_name?.trim() || !child_last_name?.trim()) {
      return json({ error: "Swimmer name required" }, 400);
    }
    if (!child_dob || Number.isNaN(Date.parse(child_dob))) {
      return json({ error: "Swimmer date of birth required" }, 400);
    }
    if (!parent_email || !emailRe.test(parent_email)) {
      return json({ error: "Valid parent_email required" }, 400);
    }
    if (recurring_consent !== true) {
      return json({ error: "Recurring billing consent required" }, 400);
    }
    if (waiver_id && !uuidRe.test(waiver_id)) {
      return json({ error: "Invalid waiver_id" }, 400);
    }

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("membership_plans")
      .select("id, plan_key, name, monthly_price_cents, stripe_product_id, stripe_price_id, active")
      .eq("plan_key", plan_key)
      .maybeSingle();
    if (planErr || !plan || !plan.active) return json({ error: "Plan not available" }, 404);

    const { data: slot, error: slotErr } = await supabaseAdmin
      .from("standing_slots")
      .select("id, plan_key, day_of_week, start_time, end_time, capacity, instructor_id, active, swim_level")
      .eq("id", standing_slot_id)
      .maybeSingle();
    if (slotErr || !slot || !slot.active) return json({ error: "Slot not available" }, 404);
    if (slot.plan_key !== plan.plan_key) return json({ error: "Slot does not match plan" }, 400);

    const { count: usedCount, error: cntErr } = await supabaseAdmin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("standing_slot_id", slot.id)
      .in("status", ["active", "pending_cancel", "paused"]);
    if (cntErr) return json({ error: "Capacity check failed" }, 500);
    const spotsLeft = (slot.capacity ?? 0) - (usedCount ?? 0);
    if (spotsLeft <= 0) return json({ error: "This slot is full" }, 409);

    const stripe = createStripeClient(ENV);

    let stripePriceId = plan.stripe_price_id as string | null;
    let stripeProductId = plan.stripe_product_id as string | null;
    if (!stripePriceId) {
      if (!stripeProductId) {
        const product = await stripe.products.create({ name: plan.name });
        stripeProductId = product.id;
      }
      const price = await stripe.prices.create({
        product: stripeProductId!,
        unit_amount: plan.monthly_price_cents,
        currency: "usd",
        recurring: { interval: "month" },
        nickname: `${plan.name} monthly`,
      });
      stripePriceId = price.id;
      await supabaseAdmin
        .from("membership_plans")
        .update({ stripe_product_id: stripeProductId, stripe_price_id: stripePriceId })
        .eq("id", plan.id);
    }

    const quote = computeMembershipQuote(slot.day_of_week, plan.monthly_price_cents);
    const firstChargeCents = quote.firstChargeCents;
    // Anchor to the 1st of the month AFTER the first-lesson month, so the
    // first-lesson month is covered by the prorated first invoice (charged now)
    // and the next flat charge lands on the 1st of the following month.
    const anchor = quote.billingAnchorUnix;


    // ----- Stage every field before checkout so nothing is lost via Stripe metadata limits -----
    const payload = {
      plan_id: plan.id,
      plan_key: plan.plan_key,
      plan_name: plan.name,
      standing_slot_id: slot.id,
      swim_level: plan.plan_key === "kid_group" ? (swim_level || slot.swim_level || null) : null,
      child_first_name: child_first_name.trim(),
      child_last_name: child_last_name.trim(),
      child_dob,
      parent_first_name: (parent_first_name || "").trim() || null,
      parent_last_name: (parent_last_name || "").trim() || null,
      parent_name: (parent_name || `${parent_first_name || ""} ${parent_last_name || ""}`).trim(),
      parent_email: parent_email.trim().toLowerCase(),
      parent_phone: (parent_phone || "").trim() || null,
      is_first_time: is_first_time === true,
      has_medical: has_medical === true,
      medical_notes: has_medical === true ? (medical_notes || "").trim() || null : null,
      notes: (notes || "").trim() || null,
      waiver_id: waiver_id || null,
      recurring_consent_amount_cents: plan.monthly_price_cents,
      first_charge_cents: firstChargeCents,
      sms_consent: sms_consent === true,
      sms_consent_text: sms_consent === true ? (sms_consent_text || null) : null,
      sms_consent_version: sms_consent === true ? (sms_consent_version || null) : null,
      recurring_consent_version: recurring_consent_version || null,
      membership_agreement_version: membership_agreement_version || null,
      membership_agreement_text: membership_agreement_text || null,
      membership_agreement_accepted: membership_agreement_accepted === true,
    };

    const { data: pending, error: pendErr } = await supabaseAdmin
      .from("pending_memberships")
      .insert({ payload })
      .select("id")
      .single();
    if (pendErr || !pending) {
      console.error("[create-membership-checkout] pending insert failed", pendErr);
      return json({ error: "Could not stage enrollment" }, 500);
    }

    console.log("[create-membership-checkout] looking up stripe customer", parent_email);
    let customer: any;
    try {
      const existing = await stripe.customers.list({ email: parent_email, limit: 1 });
      customer = existing?.data?.[0];
    } catch (e) {
      console.error("[create-membership-checkout] customers.list failed", e);
    }
    if (!customer) {
      customer = await stripe.customers.create({
        email: parent_email,
        name: payload.parent_name || undefined,
        phone: payload.parent_phone || undefined,
      });
    }
    console.log("[create-membership-checkout] customer", customer?.id);

    const lineItems: any[] = [{ price: stripePriceId, quantity: 1 }];
    // Bill the prorated first-lesson-month amount immediately as a one-time
    // line item, then start the recurring monthly cycle on `anchor` (1st of
    // the month after the first-lesson month). We use `trial_end` instead of
    // `billing_cycle_anchor` because Stripe requires the anchor to be within
    // one billing interval of "now"; `trial_end` accepts any future date.
    if (firstChargeCents > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product: stripeProductId!,
          unit_amount: firstChargeCents,
        },
        quantity: 1,
      });
    }
    const subscriptionData: any = {
      trial_end: anchor,
      metadata: { type: "membership", pending_membership_id: pending.id },
    };


    const origin = req.headers.get("origin") || "";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ui_mode: "embedded_page",
      customer: customer.id,
      payment_method_types: ["card"],
      line_items: lineItems,
      subscription_data: subscriptionData,
      return_url:
        returnUrl || `${origin}/join?membership=success&session_id={CHECKOUT_SESSION_ID}`,
      metadata: {
        type: "membership",
        pending_membership_id: pending.id,
      },
    });
    console.log("[create-membership-checkout] session", JSON.stringify({ id: session?.id, ui_mode: (session as any)?.ui_mode, has_secret: !!session?.client_secret, url: session?.url }));

    if (!session.client_secret) {
      return json({ error: "Stripe did not return a client_secret", debug: { id: session?.id, ui_mode: (session as any)?.ui_mode, url: session?.url } }, 500);
    }

    await supabaseAdmin
      .from("pending_memberships")
      .update({ stripe_session_id: session.id })
      .eq("id", pending.id);

    return json({
      clientSecret: session.client_secret,
      firstChargeCents,
      monthlyCents: plan.monthly_price_cents,
    });
  } catch (e) {
    console.error("[create-membership-checkout] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
