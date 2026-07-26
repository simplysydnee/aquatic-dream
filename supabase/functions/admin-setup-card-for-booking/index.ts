// Admin-initiated card-on-file setup for an EXISTING lesson booking.
// Actions:
//   action="check"           → probe for a reusable PM from another booking
//                              under the same parent_email (no Stripe writes).
//   action="attach_existing" → re-validate that reusable PM, then stamp it
//                              on this booking and flip occurrences.
//   action="start"           → create Stripe setup-mode embedded Checkout
//                              session (collect a new card).
//   action="finalize"        → after embedded checkout completes, attach the
//                              new PM to this booking and flip occurrences.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { findReusableCardForEmail } from "../_shared/card-on-file.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Env = z.enum(["sandbox", "live"]);
const CheckSchema = z.object({
  action: z.literal("check"),
  booking_id: z.string().uuid(),
  environment: Env,
});
const AttachExistingSchema = z.object({
  action: z.literal("attach_existing"),
  booking_id: z.string().uuid(),
  source_booking_id: z.string().uuid(),
  environment: Env,
});
const StartSchema = z.object({
  action: z.literal("start"),
  booking_id: z.string().uuid(),
  environment: Env,
});
const RepairSchema = z.object({
  action: z.literal("repair"),
  booking_id: z.string().uuid(),
  environment: Env,
});
const FinalizeSchema = z.object({
  action: z.literal("finalize"),
  booking_id: z.string().uuid(),
  checkout_session_id: z.string().min(1),
  environment: Env,
});
const BodySchema = z.discriminatedUnion("action", [
  CheckSchema,
  AttachExistingSchema,
  StartSchema,
  RepairSchema,
  FinalizeSchema,
]);


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
      .select("id, status, parent_name, parent_email, parent_phone, stripe_customer_id, stripe_payment_method_id")
      .eq("id", body.booking_id)
      .maybeSingle();
    if (bErr || !booking) return j({ error: "Booking not found" }, 404);

    const stripe = createStripeClient(body.environment as StripeEnv);

    // ─────────────────────────────────────── CHECK ───────────────────────────────────────
    if (body.action === "check") {
      // If this booking already has a card, no reuse banner needed.
      if (booking.stripe_payment_method_id) {
        return j({ found: false, reason: "already_has_card" });
      }
      if (!booking.parent_email) return j({ found: false, reason: "no_prior_pm" });

      const result = await findReusableCardForEmail(
        supabaseAdmin,
        stripe,
        booking.parent_email,
      );
      return j(result);
    }

    // ─────────────────────────────────── ATTACH_EXISTING ─────────────────────────────────
    if (body.action === "attach_existing") {
      if (booking.stripe_payment_method_id) {
        return j({ error: "Booking already has a card on file" }, 400);
      }
      if (!booking.parent_email) return j({ error: "Booking missing parent email" }, 400);

      const result = await findReusableCardForEmail(
        supabaseAdmin,
        stripe,
        booking.parent_email,
      );
      if (!result.found) {
        return j({ error: "No reusable card found for this parent" }, 400);
      }
      // Defense in depth: require the source booking the UI showed the admin
      // is the one we'd actually attach. Prevents stale-UI races.
      if (result.source_booking_id !== body.source_booking_id) {
        return j({
          error: "Selected card no longer matches the parent's most recent card",
        }, 409);
      }

      await supabaseAdmin.from("lesson_bookings").update({
        stripe_payment_method_id: result.stripe_payment_method_id,
        stripe_customer_id: result.stripe_customer_id,
      }).eq("id", booking.id);

      await supabaseAdmin.from("lesson_booking_occurrences")
        .update({
          payment_status: "card_on_file",
          charge_status: "pending",
          charge_error: null,
        })
        .eq("booking_id", booking.id)
        .neq("status", "cancelled")
        .neq("payment_status", "paid");

      return j({
        success: true,
        payment_method_id: result.stripe_payment_method_id,
        customer_id: result.stripe_customer_id,
        brand: result.brand,
        last4: result.last4,
      });
    }

    // ─────────────────────────────────────── REPAIR ──────────────────────────────────────
    // Backfill a card that already exists (on another booking row, or in
    // Stripe under this parent's customer) onto a booking that lost it.
    // Never charges anything.
    if (body.action === "repair") {
      if (!booking.parent_email) return j({ error: "Booking missing parent email" }, 400);

      if (booking.stripe_payment_method_id) {
        // Card already stamped — just make sure occurrences reflect it.
        await supabaseAdmin.from("lesson_booking_occurrences")
          .update({ payment_status: "card_on_file", charge_status: "pending", charge_error: null })
          .eq("booking_id", booking.id)
          .neq("status", "cancelled")
          .neq("payment_status", "paid");
        return j({ repaired: false, already_had_card: true });
      }

      const result = await findReusableCardForEmail(supabaseAdmin, stripe, booking.parent_email);
      if (!result.found) {
        return j({ repaired: false, reason: result.reason });
      }

      const bookingUpdate: Record<string, unknown> = {
        stripe_payment_method_id: result.stripe_payment_method_id,
        stripe_customer_id: result.stripe_customer_id,
      };
      if (booking.status === "pending_card") bookingUpdate.status = "active";
      await supabaseAdmin.from("lesson_bookings").update(bookingUpdate).eq("id", booking.id);

      await supabaseAdmin.from("lesson_booking_occurrences")
        .update({ status: "scheduled" })
        .eq("booking_id", booking.id)
        .eq("status", "pending_card");

      const { data: updated } = await supabaseAdmin.from("lesson_booking_occurrences")
        .update({
          payment_status: "card_on_file",
          charge_status: "pending",
          charge_error: null,
        })
        .eq("booking_id", booking.id)
        .neq("status", "cancelled")
        .neq("payment_status", "paid")
        .select("id");


      return j({
        repaired: true,
        payment_method_id: result.stripe_payment_method_id,
        customer_id: result.stripe_customer_id,
        brand: result.brand,
        last4: result.last4,
        occurrences_updated: (updated as any[] | null)?.length ?? 0,
      });
    }


    // ─────────────────────────────────────── START ───────────────────────────────────────
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

    // ───────────────────────────────────── FINALIZE ──────────────────────────────────────
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

    await supabaseAdmin.from("lesson_booking_occurrences")
      .update({
        payment_status: "card_on_file",
        charge_status: "pending",
        charge_error: null,
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
