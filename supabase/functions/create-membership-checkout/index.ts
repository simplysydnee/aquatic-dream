import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createStripeClient } from "../_shared/stripe.ts";

// SANDBOX ONLY — Phase 3b. Never use the live key here.
const ENV = "sandbox" as const;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emailRe = /^\S+@\S+\.\S+$/;

/** Count how many times a given weekday (0=Sun..6=Sat) occurs in the current PT month. */
function weekdayCountsInCurrentMonth(dow: number): { total: number; remaining: number } {
  // Today in PT (YYYY-MM-DD)
  const todayPT = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = todayPT.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  let total = 0;
  let remaining = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    // Use UTC constructor — day-of-week is stable regardless of TZ shift.
    const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (wd === dow) {
      total++;
      if (day >= d) remaining++;
    }
  }
  return { total, remaining };
}

/** First-of-next-month at midnight PT, as a unix timestamp (seconds). */
function unixFirstOfNextMonthPT(): number {
  const todayPT = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m] = todayPT.split("-").map(Number);
  // Next month, day 1, 08:00 UTC ≈ 00:00/01:00 PT — safely inside the day in PT.
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return Math.floor(Date.UTC(nextY, nextM - 1, 1, 8, 0, 0) / 1000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      plan_key,
      standing_slot_id,
      child_first_name,
      child_last_name,
      parent_name,
      parent_email,
      parent_phone,
      recurring_consent,
      sms_consent,
      returnUrl,
    } = body ?? {};

    // ----- Validate input -----
    if (!["kid_group", "private", "adult_group"].includes(plan_key)) {
      return json({ error: "Invalid plan_key" }, 400);
    }
    if (typeof standing_slot_id !== "string" || !uuidRe.test(standing_slot_id)) {
      return json({ error: "Invalid standing_slot_id" }, 400);
    }
    if (!child_first_name?.trim() || !child_last_name?.trim()) {
      return json({ error: "Child name required" }, 400);
    }
    if (!parent_email || !emailRe.test(parent_email)) {
      return json({ error: "Valid parent_email required" }, 400);
    }
    if (recurring_consent !== true) {
      return json({ error: "Recurring billing consent required" }, 400);
    }

    // ----- Load plan -----
    const { data: plan, error: planErr } = await supabaseAdmin
      .from("membership_plans")
      .select("id, plan_key, name, monthly_price_cents, stripe_product_id, stripe_price_id, active")
      .eq("plan_key", plan_key)
      .maybeSingle();
    if (planErr || !plan || !plan.active) {
      return json({ error: "Plan not available" }, 404);
    }

    // ----- Load slot + re-check capacity -----
    const { data: slot, error: slotErr } = await supabaseAdmin
      .from("standing_slots")
      .select("id, plan_id, day_of_week, start_time, end_time, capacity, instructor_id, active")
      .eq("id", standing_slot_id)
      .maybeSingle();
    if (slotErr || !slot || !slot.active) return json({ error: "Slot not available" }, 404);
    if (slot.plan_id !== plan.id) return json({ error: "Slot does not match plan" }, 400);

    const { count: usedCount, error: cntErr } = await supabaseAdmin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("standing_slot_id", slot.id)
      .in("status", ["active", "pending_cancel", "paused"]);
    if (cntErr) return json({ error: "Capacity check failed" }, 500);
    const spotsLeft = (slot.capacity ?? 0) - (usedCount ?? 0);
    if (spotsLeft <= 0) return json({ error: "This slot is full" }, 409);

    const stripe = createStripeClient(ENV);

    // ----- Auto-provision Stripe product/price if missing (sandbox testing) -----
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

    // ----- Compute prorated first charge -----
    const { total, remaining } = weekdayCountsInCurrentMonth(slot.day_of_week);
    const firstChargeCents =
      total > 0 && remaining > 0
        ? Math.round((plan.monthly_price_cents * remaining) / total)
        : 0;

    const anchor = unixFirstOfNextMonthPT();

    // ----- Find/create Stripe customer by email -----
    const existing = await stripe.customers.list({ email: parent_email, limit: 1 });
    const customer =
      existing.data[0] ??
      (await stripe.customers.create({
        email: parent_email,
        name: parent_name || undefined,
        phone: parent_phone || undefined,
      }));

    // ----- Build embedded Checkout Session (subscription mode) -----
    const lineItems: any[] = [
      { price: stripePriceId, quantity: 1 },
    ];
    // Prorated first-month one-off, added as an invoice item on the subscription's
    // first invoice via `add_invoice_items`. Only include when > 0.
    const subscriptionData: any = {
      billing_cycle_anchor: anchor,
      proration_behavior: "none",
      metadata: {
        type: "membership",
        plan_key: plan.plan_key,
        standing_slot_id: slot.id,
      },
    };
    if (firstChargeCents > 0) {
      subscriptionData.add_invoice_items = [
        {
          price_data: {
            currency: "usd",
            product: stripeProductId!,
            unit_amount: firstChargeCents,
          },
          quantity: 1,
        },
      ];
    }

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
        plan_key: plan.plan_key,
        plan_id: plan.id,
        standing_slot_id: slot.id,
        child_first_name: child_first_name.trim(),
        child_last_name: child_last_name.trim(),
        parent_name: (parent_name || "").trim(),
        parent_email,
        parent_phone: parent_phone || "",
        sms_consent: sms_consent ? "1" : "0",
        recurring_consent_amount_cents: String(plan.monthly_price_cents),
        first_charge_cents: String(firstChargeCents),
        anchor_unix: String(anchor),
      },
    });

    if (!session.client_secret) {
      return json({ error: "Stripe did not return a client_secret" }, 500);
    }

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
