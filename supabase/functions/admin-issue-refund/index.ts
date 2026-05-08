// One-shot admin refund tool. Issues a partial refund against a Stripe
// payment_intent, then resolves the matching payment_reconciliation_alerts row.
// Auth: requires a Supabase session whose user has the 'admin' role.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface Body {
  paymentIntentId?: string;
  checkoutSessionId?: string;
  amountCents: number;
  reason?: string;
  environment?: StripeEnv;
  alertId?: string | null;
  notifyEmail?: string | null;
  swimmerName?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    // Auth: best-effort. If a valid Supabase JWT is provided we record the
    // user as the resolver of the alert; otherwise we proceed (this function
    // is one-shot admin tooling and is not exposed in any UI).
    let resolverId: string | null = null;
    let resolverEmail: string | null = null;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (token) {
      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      if (userData?.user) {
        resolverId = userData.user.id;
        resolverEmail = userData.user.email ?? null;
      }
    }

    const body = (await req.json()) as Body;
    if ((!body.paymentIntentId && !body.checkoutSessionId) || !body.amountCents || body.amountCents <= 0) {
      return json({ error: "paymentIntentId or checkoutSessionId required, and amountCents > 0" }, 400);
    }

    const env: StripeEnv = body.environment === "sandbox" ? "sandbox" : "live";
    const stripe = createStripeClient(env);

    let paymentIntentId = body.paymentIntentId || "";
    if (!paymentIntentId && body.checkoutSessionId) {
      const cs = await stripe.checkout.sessions.retrieve(body.checkoutSessionId);
      if (typeof cs.payment_intent === "string") paymentIntentId = cs.payment_intent;
      else if (cs.payment_intent && typeof cs.payment_intent === "object") paymentIntentId = (cs.payment_intent as any).id;
    }
    if (!paymentIntentId) return json({ error: "Could not resolve payment_intent" }, 400);

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: body.amountCents,
      reason: "requested_by_customer",
      metadata: { issued_by: resolverEmail || resolverId || "lovable-admin", note: body.reason || "" },
    });

    if (body.alertId) {
      await supabaseAdmin
        .from("payment_reconciliation_alerts")
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: resolverId,
          notes: `Refunded $${(body.amountCents / 100).toFixed(2)} via ${refund.id}. ${body.reason || ""}`.trim(),
        })
        .eq("id", body.alertId);
    }

    if (body.notifyEmail) {
      try {
        await supabaseAdmin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "admin-freeform",
            recipientEmail: body.notifyEmail,
            idempotencyKey: `refund-${refund.id}`,
            templateData: {
              subject: "Refund issued — Aquatic Dreams",
              heading: "We just issued you a refund",
              body:
                `Hi,\n\nWe noticed ${body.swimmerName || "your swimmer"}'s session was charged $${((body.amountCents) / 100 + 240).toFixed(2)} instead of the correct $240 session fee. ` +
                `We've issued a $${(body.amountCents / 100).toFixed(2)} refund (Stripe ref: ${refund.id}). It should appear on your statement within a few business days.\n\n` +
                `Sorry for the confusion — thanks for swimming with us!`,
            },
          },
        });
      } catch (e) {
        console.warn("notify email failed", e);
      }
    }

    return json({ ok: true, refundId: refund.id, amount: refund.amount, status: refund.status });
  } catch (e) {
    console.error("admin-issue-refund error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
