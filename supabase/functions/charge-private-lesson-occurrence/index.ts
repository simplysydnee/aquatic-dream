// Cron-style: finds occurrences from yesterday with auto_charge_status='pending',
// charges $price_per_session off-session via stored payment method.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createStripeClient } from "../_shared/stripe.ts";
import { getPrivateLessonPrice } from "../_shared/private-lesson-pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    const envParam = url.searchParams.get("env") || "live";
    const stripe = createStripeClient(envParam === "sandbox" ? "sandbox" : "live");

    // "Today" in America/Los_Angeles (the studio's local time).
    const laToday = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
    );
    laToday.setHours(0, 0, 0, 0);
    // Look ahead 1 day so we can charge lessons ~1h before start_time.
    const lookahead = new Date(laToday);
    lookahead.setDate(lookahead.getDate() + 1);
    const yyyy_mm_dd_max = lookahead.toISOString().slice(0, 10);

    // Charge occurrences whose date <= tomorrow and are still pending.
    // Per-row guard below enforces the 1h-before-start-time window.
    const { data: due, error } = await supabase
      .from("lesson_booking_occurrences")
      .select("id, booking_id, occurrence_date, status, lesson_bookings!inner(id, parent_email, parent_first_name, parent_name, child_name, stripe_customer_id, stripe_payment_method_id, price_per_session, instructor_name, lesson_type, start_time, end_time)")
      .eq("auto_charge_status", "pending")
      .lte("occurrence_date", yyyy_mm_dd_max)
      .neq("status", "cancelled")
      .limit(50);
    if (error) throw error;

    const results: any[] = [];
    const nowMs = Date.now();
    for (const row of (due as any[]) ?? []) {
      const b = row.lesson_bookings;
      // Charge no earlier than 1 hour before the lesson's start_time (Pacific).
      // Past-due occurrences (date in the past) always pass.
      if (b?.start_time) {
        const lessonStart = new Date(
          new Date(`${row.occurrence_date}T${b.start_time}`).toLocaleString("en-US", {
            timeZone: "America/Los_Angeles",
          }),
        );
        const chargeWindowOpen = lessonStart.getTime() - 60 * 60 * 1000;
        if (nowMs < chargeWindowOpen) {
          results.push({ id: row.id, ok: false, reason: "before_1h_window" });
          continue;
        }
      }
      if (!b?.stripe_customer_id || !b?.stripe_payment_method_id) {
        await supabase.from("lesson_booking_occurrences").update({
          auto_charge_status: "failed",
          auto_charge_attempted_at: new Date().toISOString(),
          auto_charge_error: "No payment method on file",
        }).eq("id", row.id);
        results.push({ id: row.id, ok: false, reason: "no_pm" });
        continue;
      }
      // Authoritative: derive from lesson_type + occurrence date. Honors the
      // June 2026 promo even on bookings created before June with a stale
      // price_per_session snapshot.
      const dollars = getPrivateLessonPrice(b.lesson_type, row.occurrence_date);
      const amount = Math.round(dollars * 100);
      try {
        const pi = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          customer: b.stripe_customer_id,
          payment_method: b.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: `Private Lesson — ${b.child_name || b.parent_name} — ${row.occurrence_date}`,
          metadata: { type: "private_lesson_charge", occurrence_id: row.id, booking_id: b.id },
        });
        await supabase.from("lesson_booking_occurrences").update({
          auto_charge_status: pi.status === "succeeded" ? "succeeded" : "failed",
          auto_charge_attempted_at: new Date().toISOString(),
          stripe_payment_intent_id: pi.id,
          payment_status: pi.status === "succeeded" ? "paid" : "unpaid",
          paid_at: pi.status === "succeeded" ? new Date().toISOString() : null,
          auto_charge_error: pi.status === "succeeded" ? null : `Status: ${pi.status}`,
        }).eq("id", row.id);
        results.push({ id: row.id, ok: pi.status === "succeeded", status: pi.status });
      } catch (e: any) {
        const msg = e?.message || "Charge failed";
        await supabase.from("lesson_booking_occurrences").update({
          auto_charge_status: "failed",
          auto_charge_attempted_at: new Date().toISOString(),
          auto_charge_error: msg,
        }).eq("id", row.id);
        results.push({ id: row.id, ok: false, reason: msg });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("charge-private-lesson-occurrence error", err);
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
