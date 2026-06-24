// Admin-initiated one-shot charge for a single private lesson occurrence.
// Off-session PaymentIntent on the stored payment method. Mirrors the
// cron `charge-private-lesson-occurrence` but scoped to one row and
// authenticated as an admin user.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  occurrence_id: z.string().uuid(),
  environment: z.enum(["sandbox", "live"]),
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return j({ error: "Missing Authorization" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return j({ error: "Invalid auth token" }, 401);
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return j({ error: "Admin role required" }, 403);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return j({ error: parsed.error.flatten() }, 400);
    const { occurrence_id, environment } = parsed.data;

    const { data: row, error: rErr } = await supabaseAdmin
      .from("lesson_booking_occurrences")
      .select("id, booking_id, occurrence_date, payment_status, charge_status, stripe_payment_intent_id, lesson_bookings!inner(id, parent_name, child_name, lesson_type, stripe_customer_id, stripe_payment_method_id, price_per_session)")
      .eq("id", occurrence_id)
      .maybeSingle();
    if (rErr || !row) return j({ error: "Occurrence not found" }, 404);
    if (row.payment_status === "paid") return j({ error: "Already paid" }, 400);
    if (row.charge_status === "succeeded" || row.stripe_payment_intent_id) {
      return j({
        error: "already_charged",
        payment_intent_id: row.stripe_payment_intent_id ?? null,
      }, 409);
    }

    const b: any = (row as any).lesson_bookings;
    if (!b?.stripe_customer_id || !b?.stripe_payment_method_id) {
      return j({ error: "No card on file" }, 400);
    }

    const stripe = createStripeClient(environment as StripeEnv);
    const amount = Math.round(Number(b.price_per_session) * 100);

    const pi = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      customer: b.stripe_customer_id,
      payment_method: b.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      description: `Private Lesson — ${b.child_name || b.parent_name} — ${row.occurrence_date}`,
      metadata: {
        type: "private_lesson_charge_admin",
        occurrence_id: row.id,
        booking_id: b.id,
        charged_by: userData.user.id,
      },
    }, {
      idempotencyKey: `occ_${occurrence_id}`,
    });


    const succeeded = pi.status === "succeeded";
    // Write 1: charge record — always runs so we never lose track of a real
    // Stripe PaymentIntent, even if the payment stamp write below fails.
    await supabaseAdmin.from("lesson_booking_occurrences").update({
      charge_status: succeeded ? "succeeded" : "failed",
      charge_attempted_at: new Date().toISOString(),
      stripe_payment_intent_id: pi.id,
      charge_error: succeeded ? null : `Status: ${pi.status}`,
    }).eq("id", row.id);

    // Write 2: payment stamp — only on success. Kept separate so a schema
    // drift here can't swallow the charge record from write 1.
    if (succeeded) {
      await supabaseAdmin.from("lesson_booking_occurrences").update({
        payment_status: "paid",
        paid_at: new Date().toISOString(),
        payment_method: "card_on_file",
      }).eq("id", row.id);
    }

    if (!succeeded) return j({ error: `Charge ${pi.status}` }, 402);
    return j({ success: true, payment_intent_id: pi.id });
  } catch (err: any) {
    console.error("admin-charge-private-lesson-occurrence error", err);
    return j({ error: err?.message || "Internal error" }, 500);
  }
});
