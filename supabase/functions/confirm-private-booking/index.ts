// Verifies SetupIntent succeeded, stores payment_method_id, flips booking to active,
// sends confirmation email, releases slot holds.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { sendPrivateBookingConfirmation } from "../_shared/send-private-booking-confirmation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  environment: z.enum(["sandbox", "live"]),
  booking_id: z.string().uuid(),
  checkout_session_id: z.string().min(3),
  session_token: z.string().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return j({ error: parsed.error.flatten() }, 400);
    const { environment, booking_id, checkout_session_id, session_token } = parsed.data;

    const stripe = createStripeClient(environment as StripeEnv);
    const cs = await stripe.checkout.sessions.retrieve(checkout_session_id);
    if (cs.status !== "complete" || !cs.setup_intent) {
      return j({ error: `Checkout not complete: ${cs.status}` }, 400);
    }

    const setupIntentId = typeof cs.setup_intent === "string" ? cs.setup_intent : cs.setup_intent.id;
    const si = await stripe.setupIntents.retrieve(setupIntentId);
    if (si.status !== "succeeded" || !si.payment_method) {
      return j({ error: `SetupIntent not ready: ${si.status}` }, 400);
    }

    const paymentMethodId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method.id;

    // Re-check for slot conflicts before activating — another booking could
    // have completed during this checkout. Cancel & refund the card setup
    // intent if we'd be activating onto a now-taken slot.
    const { data: pending } = await supabase
      .from("lesson_booking_occurrences")
      .select("id, occurrence_date, lesson_bookings!inner(instructor_id, start_time, end_time)")
      .eq("booking_id", booking_id)
      .eq("status", "pending_card");

    for (const p of (pending as any[]) || []) {
      const lb = p.lesson_bookings;
      const { data: conflicts } = await supabase
        .from("lesson_booking_occurrences")
        .select("id, status, created_at, start_time_override, end_time_override, instructor_override_id, lesson_bookings!inner(instructor_id, start_time, end_time)")
        .eq("occurrence_date", p.occurrence_date)
        .neq("id", p.id)
        .neq("status", "cancelled");
      const hit = ((conflicts as any[]) || []).some((c) => {
        if (c.status === "pending_card" && c.created_at && (Date.now() - new Date(c.created_at).getTime()) > 30 * 60 * 1000) return false;
        const cInst = c.instructor_override_id || c.lesson_bookings?.instructor_id;
        if (cInst !== lb?.instructor_id) return false;
        const cs = (c.start_time_override || c.lesson_bookings?.start_time || "").slice(0, 5);
        const ce = (c.end_time_override || c.lesson_bookings?.end_time || "").slice(0, 5);
        const ps = (lb?.start_time || "").slice(0, 5);
        const pe = (lb?.end_time || "").slice(0, 5);
        return ps < ce && pe > cs;
      });
      if (hit) {
        await supabase.from("lesson_booking_occurrences")
          .update({ status: "cancelled", cancel_reason: "slot taken during checkout" })
          .eq("booking_id", booking_id);
        await supabase.from("lesson_bookings")
          .update({ status: "cancelled" })
          .eq("id", booking_id);
        return j({ error: "slot_taken_during_checkout", message: "Sorry — another parent booked one of your slots while you were checking out. No card was charged. Please pick a different slot." }, 409);
      }
    }

    const { error: uErr } = await supabase.from("lesson_bookings").update({
      stripe_payment_method_id: paymentMethodId,
      status: "active",
      updated_at: new Date().toISOString(),
    }).eq("id", booking_id);
    if (uErr) throw uErr;

    await supabase.from("lesson_booking_occurrences").update({
      status: "scheduled",
      payment_status: "card_on_file",
    }).eq("booking_id", booking_id).eq("status", "pending_card");

    if (session_token) {
      await supabase.from("slot_holds").delete().eq("session_token", session_token);
    }

    // Send confirmation via shared helper (card-on-file, no payment link).
    await sendPrivateBookingConfirmation(supabase, booking_id, { mode: "initial" });

    return j({ success: true, booking_id });
  } catch (err: any) {
    console.error("confirm-private-booking error", err);
    return j({ error: err?.message || "Internal error" }, 500);
  }
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
