import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createStripeClient } from "../_shared/stripe.ts";
import { computeMembershipQuote } from "../_shared/membership-pricing.ts";
import {
  programEligibilityError,
  waiverDobMismatch,
  type ProgramKey,
} from "../_shared/program-eligibility.ts";
import { resolveParentStripeCustomer, verifySavedCard } from "../_shared/stripe-customer.ts";
import {
  completeMembershipWithSavedCard,
  MembershipSlotFullError,
  MembershipCardDeclinedError,
} from "../_shared/membership-completion.ts";

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
      reuse_token,
      source,
    } = body ?? {};

    // SECURITY: the Stripe environment is server-controlled only. Any
    // client-supplied `environment` value in the request body is ignored.
    // There is no default: a missing or unrecognized PAYMENTS_ENV is a
    // configuration error and the request is rejected.
    const configuredEnv = Deno.env.get("PAYMENTS_ENV");
    if (configuredEnv !== "live" && configuredEnv !== "sandbox") {
      console.error("[create-membership-checkout] PAYMENTS_ENV missing or invalid");
      return json({ error: "Payments are not configured. Contact the school." }, 500);
    }
    const ENV: StripeEnv = configuredEnv;

    // SECURITY: in sandbox, only a verified admin may create a membership.
    // This is deliberately NOT a client-supplied flag (that was the hole
    // closed on Aug 1). The caller must present a real Supabase JWT whose
    // user passes the server-side has_role(uid,'admin') check, so a public
    // /join request can never produce a test-mode membership.
    // Verified admin caller, used by the sandbox gate below and by the age
    // gate (front desk keeps full program choice).
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    let isAdminCaller = false;
    if (bearer) {
      const { data: userData } = await supabaseAdmin.auth.getUser(bearer);
      const uid = userData?.user?.id;
      if (uid) {
        const { data: hasRole } = await supabaseAdmin.rpc("has_role", {
          _user_id: uid,
          _role: "admin",
        });
        isAdminCaller = hasRole === true;
      }
    }

    if (ENV === "sandbox") {
      if (!isAdminCaller) {
        console.warn("[create-membership-checkout] sandbox request rejected: not an admin");
        return json(
          {
            error:
              "Enrollment is temporarily closed while we finish maintenance. Please give us a call and we will save your spot.",
            sandboxBlocked: true,
          },
          403,
        );
      }
    }





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

    // SECURITY: the /join age gate runs in the browser, so it is a courtesy,
    // not a guarantee. Re-check the age against the program here, where a
    // hand-rolled request or a stale client cannot skip it. Admin and front
    // desk requests keep full program choice.
    if (!isAdminCaller) {
      const ageError = programEligibilityError(plan_key as ProgramKey, child_dob);
      if (ageError) {
        console.warn("[create-membership-checkout] age gate rejected", { plan_key, child_dob });
        return json({ error: ageError, ageBlocked: true }, 400);
      }
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

    // A signed waiver is the record of truth for the swimmer's date of birth.
    // If the submitted one disagrees, stop rather than quietly trusting the
    // newer value.
    if (waiver_id && !isAdminCaller) {
      const { data: waiverRow } = await supabaseAdmin
        .from("visitor_waivers")
        .select("swimmers")
        .eq("id", waiver_id)
        .maybeSingle();
      const dobError = waiverDobMismatch(
        waiverRow?.swimmers,
        child_first_name,
        child_last_name,
        child_dob,
      );
      if (dobError) {
        console.warn("[create-membership-checkout] waiver dob mismatch", { waiver_id });
        return json({ error: dobError, dobMismatch: true }, 400);
      }
    }

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("membership_plans")
      .select("id, plan_key, name, monthly_price_cents, stripe_product_id, stripe_price_id, stripe_product_id_sandbox, stripe_price_id_sandbox, stripe_product_id_live, stripe_price_id_live, active")
      .eq("plan_key", plan_key)
      .maybeSingle();
    if (planErr || !plan || !plan.active) return json({ error: "Plan not available" }, 404);

    const { data: slot, error: slotErr } = await supabaseAdmin
      .from("standing_slots")
      .select("id, plan_key, day_of_week, start_time, end_time, capacity, instructor_id, active, swim_level, accepted_levels")
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

    // Small Group classes lock to the level of the first swimmer enrolled.
    // An empty accepted_levels means the class is still open to any group.
    if (plan_key === "kid_group") {
      const accepted = ((slot as any).accepted_levels as string[] | null) ?? null;
      if (accepted && accepted.length > 0 && !accepted.includes(swim_level)) {
        return json(
          {
            error:
              "This class is now set to a different swim group. Please pick another class time that matches your swimmer's group.",
            levelMismatch: true,
          },
          409,
        );
      }
    }



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
      // Campaign tag from /join?src=..., kept short and sanitized.
      source: (String(source || "public").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40)) || "public",
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
    let pendingId = pending.id as string;



    // One Stripe customer per parent email. The resolver is shared so every
    // membership for a family lands on the same customer record and the card
    // they saved last time is the card we can offer next time.
    let customerId: string;
    try {
      const resolved = await resolveParentStripeCustomer(stripe, {
        email: payload.parent_email,
        name: payload.parent_name || null,
        phone: payload.parent_phone || null,
      });
      customerId = resolved.customerId;
    } catch (e: any) {
      console.error("[create-membership-checkout] customer resolve failed", {
        type: e?.type, code: e?.code, message: e?.message, raw: e?.raw?.message,
      });
      return json({ error: `Stripe customer setup failed: ${e?.message || "unknown"}`, stripe_type: e?.type, stripe_code: e?.code }, 500);
    }

    // Saved-card path. The reuse token was minted by
    // lookup-parent-card-on-file-public, which already proved this browser
    // knows the family's email AND parent name, so no Checkout session is
    // needed: we complete the membership on the card already on file.
    if (typeof reuse_token === "string" && reuse_token.length >= 32) {
      const { data: tok } = await supabaseAdmin
        .from("card_reuse_tokens")
        .select("token, parent_email, stripe_customer_id, stripe_payment_method_id, expires_at, consumed_at")
        .eq("token", reuse_token)
        .maybeSingle();

      const tokenOk =
        tok &&
        !(tok as any).consumed_at &&
        new Date((tok as any).expires_at).getTime() > Date.now() &&
        ((tok as any).parent_email || "").toLowerCase() === payload.parent_email;

      if (tokenOk) {
        const card = await verifySavedCard(
          stripe,
          (tok as any).stripe_customer_id,
          (tok as any).stripe_payment_method_id,
        );
        if (card) {
          try {
            const result = await completeMembershipWithSavedCard({
              pendingId,
              customerId: (tok as any).stripe_customer_id,
              paymentMethodId: card.paymentMethodId,
              env: ENV,
            });
            await supabaseAdmin
              .from("card_reuse_tokens")
              .update({ consumed_at: new Date().toISOString() })
              .eq("token", (tok as any).token);

            const { data: mem } = await supabaseAdmin
              .from("memberships")
              .select("manage_token")
              .eq("id", result.membershipId)
              .maybeSingle();

            return json({
              savedCardUsed: true,
              membershipId: result.membershipId,
              manageToken: (mem?.manage_token as string | null) ?? null,
              firstChargeCents: result.firstChargeCents,
              monthlyCents: result.monthlyCents,
              card: { brand: card.brand, last4: card.last4 },
            });
          } catch (e: any) {
            if (e instanceof MembershipSlotFullError) {
              return json({
                slotFull: true,
                error:
                  "This class time filled up while you were checking out. You have not been charged. Our team will call you right away to pick a new time.",
              }, 409);
            }
            if (e instanceof MembershipCardDeclinedError) {
              return json({
                declined: true,
                error:
                  "Your bank declined the card we had on file. Please enter a different card below.",
              }, 402);
            }
            if (String(e?.message || "").includes("MEMBERSHIP_LEVEL_MISMATCH")) {
              return json({
                levelMismatch: true,
                error:
                  "This class is now set to a different swim group. You have not been charged. Please pick another class time that matches your swimmer's group.",
              }, 409);
            }
            // Anything else: fall through to normal Checkout so the parent
            // can still enroll by entering a card.

            console.error("[create-membership-checkout] saved-card completion failed", e?.message || e);
            // The pending row above may already be claimed by the failed
            // attempt, so stage a fresh one for the Checkout fallback.
            const { data: retryPending } = await supabaseAdmin
              .from("pending_memberships")
              .insert({ payload })
              .select("id")
              .single();
            if (retryPending?.id) pendingId = retryPending.id as string;
          }
        }
      }
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
        customer: customerId,
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
      .eq("id", pendingId);

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
