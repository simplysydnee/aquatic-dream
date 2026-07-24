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

    // PINNED to sandbox until go-live. See aquatic-dreams-GOLIVE-checklist.md.
    // Ignores caller-provided `environment` on purpose so live checkout can't
    // be triggered from /join accidentally while we're still testing.
    void environment;
    const ENV: StripeEnv = "sandbox";

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
      .select("id, plan_key, name, monthly_price_cents, stripe_product_id, stripe_price_id, stripe_product_id_sandbox, stripe_price_id_sandbox, stripe_product_id_live, stripe_price_id_live, active")
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

    // Cache Stripe product/price IDs PER ENVIRONMENT.
    const priceCol = ENV === "sandbox" ? "stripe_price_id_sandbox" : "stripe_price_id_live";
    const productCol = ENV === "sandbox" ? "stripe_product_id_sandbox" : "stripe_product_id_live";
    let stripePriceId = (plan as any)[priceCol] as string | null;
    let stripeProductId = (plan as any)[productCol] as string | null;
    try {
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
          .update({ [productCol]: stripeProductId, [priceCol]: stripePriceId })
          .eq("id", plan.id);
      }
    } catch (e: any) {
      console.error("[create-membership-checkout] product/price provisioning failed", {
        type: e?.type, code: e?.code, message: e?.message, raw: e?.raw?.message,
      });
      return json({ error: `Stripe product/price setup failed: ${e?.message || "unknown"}`, stripe_type: e?.type, stripe_code: e?.code }, 500);
    }

    const quote = computeMembershipQuote(slot.day_of_week, plan.monthly_price_cents);
    const firstChargeCents = quote.firstChargeCents;
    const anchorUnix = quote.billingAnchorUnix;

    // Stage every field before checkout. We also stash the resolved Stripe
    // price/product IDs, prorated first charge, and billing anchor so the
    // webhook can create the subscription with add_invoice_items without
    // having to recompute (guaranteeing the charge matches the quote shown).
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
      first_lesson_date: quote.firstLessonDate,
      billing_start: quote.billingStart,
      billing_anchor_unix: anchorUnix,
      stripe_price_id: stripePriceId,
      stripe_product_id: stripeProductId,
      environment: ENV,
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

    let customer: any;
    try {
      const existing = await stripe.customers.list({ email: parent_email, limit: 1 });
      customer = existing?.data?.[0];
      if (!customer) {
        customer = await stripe.customers.create({
          email: parent_email,
          name: payload.parent_name || undefined,
          phone: payload.parent_phone || undefined,
        });
      }
    } catch (e: any) {
      console.error("[create-membership-checkout] customer resolve failed", {
        type: e?.type, code: e?.code, message: e?.message, raw: e?.raw?.message,
      });
      return json({ error: `Stripe customer setup failed: ${e?.message || "unknown"}`, stripe_type: e?.type, stripe_code: e?.code }, 500);
    }

    // SETUP-mode embedded Checkout: collects and saves the card only; no
    // charge here. Keep this session creation deliberately minimal: all
    // subscription, anchor, proration, and invoice-item logic belongs in the
    // webhook after Stripe confirms the saved payment method.
    const origin = req.headers.get("origin") || "";
    let session: any;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "setup",
        ui_mode: "embedded_page",
        customer: customer.id,
        currency: "usd",
        return_url:
          returnUrl || `${origin}/join?membership=success&session_id={CHECKOUT_SESSION_ID}`,
      });
    } catch (e: any) {
      console.error("[create-membership-checkout] session create failed", {
        type: e?.type, code: e?.code, message: e?.message, raw: e?.raw?.message, param: e?.param,
      });
      return json({
        error: `Stripe session creation failed: ${e?.message || "unknown"}`,
        stripe_type: e?.type,
        stripe_code: e?.code,
        stripe_param: e?.param,
      }, 500);
    }

    if (!session.client_secret) {
      console.error("[create-membership-checkout] session missing client_secret", {
        id: session?.id,
        mode: session?.mode,
        ui_mode: session?.ui_mode,
        status: session?.status,
        message: session?.message || session?.error?.message,
        type: session?.type || session?.error?.type,
        code: session?.code || session?.error?.code,
        raw: session?.raw?.message,
      });
      const gatewayMessage = session?.message || session?.error?.message || session?.raw?.message;
      return json({
        error: gatewayMessage
          ? `Stripe session creation failed: ${gatewayMessage}`
          : "Stripe did not return a client_secret",
        stripe_type: session?.type || session?.error?.type,
        stripe_code: session?.code || session?.error?.code,
        debug: { id: session?.id, mode: session?.mode, ui_mode: session?.ui_mode, status: session?.status },
      }, 500);
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
  } catch (e: any) {
    console.error("[create-membership-checkout] error", {
      type: e?.type, code: e?.code, message: e?.message, raw: e?.raw?.message, stack: e?.stack,
    });
    return json({ error: (e as Error).message, stripe_type: e?.type, stripe_code: e?.code }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
