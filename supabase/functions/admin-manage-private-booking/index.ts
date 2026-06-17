// Admin-only actions on private lesson bookings: cancel booking, delete booking,
// charge a specific occurrence now (off-session, using the card on file).
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  action: z.enum(["cancel_booking", "delete_booking", "charge_occurrence"]),
  booking_id: z.string().uuid(),
  occurrence_id: z.string().uuid().optional(),
  environment: z.enum(["sandbox", "live"]).optional(),
  reason: z.string().max(500).optional(),
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    // Admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return j({ error: "Missing Authorization header" }, 401);
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
    const { action, booking_id, occurrence_id, environment, reason } = parsed.data;

    if (action === "delete_booking") {
      // Hard delete: remove occurrences first, then booking.
      await supabaseAdmin.from("lesson_booking_occurrences").delete().eq("booking_id", booking_id);
      await supabaseAdmin.from("enrollment_agreements").delete().eq("lesson_booking_id", booking_id);
      const { error } = await supabaseAdmin.from("lesson_bookings").delete().eq("id", booking_id);
      if (error) throw error;
      return j({ success: true });
    }

    if (action === "cancel_booking") {
      // Cancel all non-cancelled, not-yet-charged occurrences. Skip auto-charge.
      const { error: oErr } = await supabaseAdmin
        .from("lesson_booking_occurrences")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: userData.user.id,
          cancel_reason: reason || "Cancelled by admin",
          charge_status: "skipped",
        })
        .eq("booking_id", booking_id)
        .neq("status", "cancelled")
        .neq("charge_status", "succeeded");
      if (oErr) throw oErr;

      const { error: bErr } = await supabaseAdmin
        .from("lesson_bookings")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", booking_id);
      if (bErr) throw bErr;
      return j({ success: true });
    }

    if (action === "charge_occurrence") {
      if (!occurrence_id) return j({ error: "occurrence_id required" }, 400);
      if (!environment) return j({ error: "environment required" }, 400);

      const { data: occ, error: oErr } = await supabaseAdmin
        .from("lesson_booking_occurrences")
        .select("id, booking_id, occurrence_date, status, charge_status, lesson_bookings!inner(id, parent_email, parent_name, child_name, stripe_customer_id, stripe_payment_method_id, price_per_session)")
        .eq("id", occurrence_id)
        .maybeSingle();
      if (oErr) throw oErr;
      if (!occ) return j({ error: "Occurrence not found" }, 404);
      if ((occ as any).charge_status === "succeeded") {
        return j({ error: "Already charged" }, 400);
      }
      const b: any = (occ as any).lesson_bookings;
      if (!b?.stripe_customer_id || !b?.stripe_payment_method_id) {
        return j({ error: "No card on file for this booking" }, 400);
      }

      const stripe = createStripeClient(environment as StripeEnv);
      const amount = Math.round(Number(b.price_per_session || 65) * 100);
      try {
        const pi = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          customer: b.stripe_customer_id,
          payment_method: b.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: `Private Lesson — ${b.child_name || b.parent_name} — ${(occ as any).occurrence_date} (admin)`,
          metadata: {
            type: "private_lesson_charge",
            occurrence_id: (occ as any).id,
            booking_id: b.id,
            triggered_by: "admin",
            admin_user_id: userData.user.id,
          },
        });
        await supabaseAdmin.from("lesson_booking_occurrences").update({
          charge_status: pi.status === "succeeded" ? "succeeded" : "failed",
          charge_attempted_at: new Date().toISOString(),
          stripe_payment_intent_id: pi.id,
          payment_status: pi.status === "succeeded" ? "paid" : "unpaid",
          paid_at: pi.status === "succeeded" ? new Date().toISOString() : null,
          charge_error: pi.status === "succeeded" ? null : `Status: ${pi.status}`,
        }).eq("id", (occ as any).id);
        return j({ success: pi.status === "succeeded", stripe_status: pi.status });
      } catch (e: any) {
        const msg = e?.message || "Charge failed";
        await supabaseAdmin.from("lesson_booking_occurrences").update({
          charge_status: "failed",
          charge_attempted_at: new Date().toISOString(),
          charge_error: msg,
        }).eq("id", (occ as any).id);
        return j({ error: msg }, 400);
      }
    }

    return j({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("admin-manage-private-booking error", err);
    return j({ error: err?.message || "Internal error" }, 500);
  }
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
