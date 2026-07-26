// Sweeps abandoned self-serve checkout carts.
//
// Self-serve booking creates rows before the card is captured. If the parent
// never finishes, those rows used to linger forever as `pending_card`, print on
// the day schedule and pollute the billing audit. This job retires them.
//
// Admin-created bookings are NEVER swept: the front desk placed the slot on
// purpose and collects the card in person.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const STALE_MINUTES = 15;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

    const { data: stale, error: findError } = await supabase
      .from("lesson_bookings")
      .select("id, booking_source, child_name, created_at")
      .eq("status", "pending_card")
      .is("stripe_payment_method_id", null)
      .lt("created_at", cutoff);

    if (findError) throw findError;

    const ids = (stale ?? [])
      .filter((b) => b.booking_source !== "admin" && b.booking_source !== "admin_manual")
      .map((b) => b.id);

    if (ids.length === 0) {
      return new Response(JSON.stringify({ swept: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Never touch an occurrence that actually took money.
    const { data: paid, error: paidError } = await supabase
      .from("lesson_booking_occurrences")
      .select("booking_id")
      .in("booking_id", ids)
      .eq("payment_status", "paid");

    if (paidError) throw paidError;

    const paidBookings = new Set((paid ?? []).map((o) => o.booking_id));
    const sweepIds = ids.filter((id) => !paidBookings.has(id));

    if (sweepIds.length === 0) {
      return new Response(JSON.stringify({ swept: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: occError } = await supabase
      .from("lesson_booking_occurrences")
      .update({
        status: "abandoned",
        payment_status: "unpaid",
        charge_status: "skipped",
        updated_at: new Date().toISOString(),
      })
      .in("booking_id", sweepIds)
      .neq("status", "cancelled")
      .neq("payment_status", "paid");

    if (occError) throw occError;

    const { error: bookingError } = await supabase
      .from("lesson_bookings")
      .update({ status: "abandoned", updated_at: new Date().toISOString() })
      .in("id", sweepIds);

    if (bookingError) throw bookingError;

    return new Response(JSON.stringify({ swept: sweepIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("sweep-abandoned-bookings failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
