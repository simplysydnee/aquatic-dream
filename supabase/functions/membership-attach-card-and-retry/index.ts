// Admin-only: take the PaymentMethod the front desk just collected (or the
// one from a completed card update link), make it the default on the
// membership's Stripe subscription, and immediately retry the open invoice.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createStripeClient, type StripeEnv } from "../_shared/stripe.ts";
import {
  attachCardAndRetry,
  paymentMethodFromSetupIntent,
  paymentMethodFromSetupSession,
} from "../_shared/membership-card.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return json({ error: guard.error }, guard.status);

    const body = await req.json();
    const membershipId = String(body?.membership_id || "");
    const setupIntentId = body?.setup_intent_id ? String(body.setup_intent_id) : "";
    const checkoutSessionId = body?.checkout_session_id ? String(body.checkout_session_id) : "";
    const directPm = body?.payment_method_id ? String(body.payment_method_id) : "";
    if (!membershipId) return json({ error: "membership_id required" }, 400);
    if (!setupIntentId && !checkoutSessionId && !directPm) {
      return json({ error: "A saved card is required" }, 400);
    }

    const configuredEnv = Deno.env.get("PAYMENTS_ENV");
    if (configuredEnv !== "live" && configuredEnv !== "sandbox") {
      return json({ error: "Payments are not configured" }, 500);
    }
    const env: StripeEnv = configuredEnv;

    const { data: membership, error } = await supabaseAdmin
      .from("memberships")
      .select("id, stripe_customer_id, stripe_subscription_id")
      .eq("id", membershipId)
      .maybeSingle();
    if (error) {
      console.error("[membership-attach-card-and-retry] load failed", error.message);
      return json({ error: "Could not load the membership" }, 500);
    }
    if (!membership) return json({ error: "Membership not found" }, 404);

    const stripe = createStripeClient(env);

    let paymentMethodId = directPm;
    let fallbackCustomerId: string | null = null;
    if (!paymentMethodId && setupIntentId) {
      const r = await paymentMethodFromSetupIntent(stripe, setupIntentId);
      paymentMethodId = r.paymentMethodId ?? "";
      fallbackCustomerId = r.customerId;
    }
    if (!paymentMethodId && checkoutSessionId) {
      const r = await paymentMethodFromSetupSession(stripe, checkoutSessionId);
      paymentMethodId = r.paymentMethodId ?? "";
      fallbackCustomerId = r.customerId;
    }
    if (!paymentMethodId) return json({ error: "No card was saved" }, 400);

    const result = await attachCardAndRetry(
      supabaseAdmin,
      stripe,
      membership as { id: string; stripe_customer_id: string | null; stripe_subscription_id: string | null },
      paymentMethodId,
      fallbackCustomerId,
    );

    return json({ success: result.outcome !== "declined", ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[membership-attach-card-and-retry] failed", msg);
    return json({ error: msg }, 500);
  }
});

async function requireAdmin(req: Request): Promise<{ ok: boolean; status: number; error?: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { ok: false, status: 401, error: "Missing Authorization header" };
  const { data, error } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !data?.user) return { ok: false, status: 401, error: "Invalid auth token" };
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
  if (!isAdmin) return { ok: false, status: 403, error: "Admin role required" };
  return { ok: true, status: 200 };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
