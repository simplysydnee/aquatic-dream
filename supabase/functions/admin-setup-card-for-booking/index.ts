// Admin-initiated card-on-file setup for an EXISTING lesson booking.
// Two actions in one endpoint:
//   action="start"   → create Stripe setup-mode embedded Checkout session,
//                      return client_secret + checkout_session_id.
//   action="finalize" → retrieve session, attach payment_method to the
//                      booking, mark occurrences card_on_file.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const StartSchema = z.object({
  action: z.literal("start"),
  booking_id: z.string().uuid(),
  environment: z.enum(["sandbox", "live"]),
});
const FinalizeSchema = z.object({
  action: z.literal("finalize"),
  booking_id: z.string().uuid(),
  checkout_session_id: z.string().min(1),
  environment: z.enum(["sandbox", "live"]),
});
const BodySchema = z.discriminatedUnion("action", [StartSchema, FinalizeSchema]);

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
    const body = parsed.data;

    const { data: booking, error: bErr } = await supabaseAdmin
      .from("lesson_bookings")
      .select("id, parent_name, parent_email, parent_phone, stripe_customer_id")
      .eq("id", body.booking_id)
      .maybeSingle();
    if (bErr || !booking) return j({ error: "Booking not found" }, 404);

    const stripe = createStripeClient(body.environment as StripeEnv);

    if (body.action === "start") {
      let customerId = booking.stripe_customer_id as string | null;
      if (!customerId) {
        const existing = await stripe.customers.list({ email: booking.parent_email, limit: 1 });
        customerId = existing.data[0]?.id
          ?? (await stripe.customers.create({
            email: booking.parent_email,
            name: booking.parent_name || undefined,
            phone: booking.parent_phone || undefined,
          })).id;
        await supabaseAdmin.from("lesson_bookings")
          .update({ stripe_customer_id: customerId })
          .eq("id", booking.id);
      }

      const session = await stripe.checkout.sessions.create({
        mode: "setup",
        ui_mode: "embedded_page",
        customer: customerId!,
        currency: "usd",
        payment_method_types: ["card"],
        redirect_on_completion: "never",
        metadata: {
          type: "admin_private_lesson_card_on_file_existing",
          booking_id: booking.id,
        },
      });

      return j({
        client_secret: session.client_secret,
        checkout_session_id: session.id,
        customer_id: customerId,
      });
    }

    // finalize
    const cs = await stripe.checkout.sessions.retrieve(body.checkout_session_id);
    if (cs.status !== "complete" || !cs.setup_intent) {
      return j({ error: `Card setup not complete: ${cs.status}` }, 400);
    }
    const siId = typeof cs.setup_intent === "string" ? cs.setup_intent : cs.setup_intent.id;
    const si = await stripe.setupIntents.retrieve(siId);
    if (si.status !== "succeeded" || !si.payment_method) {
      return j({ error: `Card setup not ready: ${si.status}` }, 400);
    }
    const pmId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method.id;
    const customerId = typeof cs.customer === "string"
      ? cs.customer
      : (cs.customer?.id ?? booking.stripe_customer_id);

    await supabaseAdmin.from("lesson_bookings").update({
      stripe_payment_method_id: pmId,
      stripe_customer_id: customerId,
    }).eq("id", booking.id);

    // Flip any unpaid/pending occurrences to card_on_file so the cron will charge them.
    await supabaseAdmin.from("lesson_booking_occurrences")
      .update({
        payment_status: "card_on_file",
        auto_charge_status: "pending",
        auto_charge_error: null,
      })
      .eq("booking_id", booking.id)
      .neq("status", "cancelled")
      .neq("payment_status", "paid");

    return j({ success: true, payment_method_id: pmId, customer_id: customerId });
  } catch (err: any) {
    console.error("admin-setup-card-for-booking error", err);
    return j({ error: err?.message || "Internal error" }, 500);
  }
});
