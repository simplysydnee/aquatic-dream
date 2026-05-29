// Cron-style: finds occurrences from yesterday with auto_charge_status='pending',
// charges $price_per_session off-session via stored payment method.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createStripeClient } from "../_shared/stripe.ts";

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
    const yyyy_mm_dd = laToday.toISOString().slice(0, 10);

    // Charge occurrences whose date <= today (so we capture day-of charges
    // and any missed prior days) and are still pending.
    const { data: due, error } = await supabase
      .from("lesson_booking_occurrences")
      .select("id, booking_id, occurrence_date, status, lesson_bookings!inner(id, parent_email, parent_first_name, parent_name, child_name, stripe_customer_id, stripe_payment_method_id, price_per_session, instructor_name, start_time, end_time)")
      .eq("auto_charge_status", "pending")
      .lte("occurrence_date", yyyy_mm_dd)
      .neq("status", "cancelled")
      .limit(50);
    if (error) throw error;

    const results: any[] = [];
    const nowMs = Date.now();
    for (const row of (due as any[]) ?? []) {
      const b = row.lesson_bookings;
      // Don't charge a lesson before it has ended (Pacific time). Past days always pass.
      if (row.occurrence_date === yyyy_mm_dd && b?.end_time) {
        const lessonEnd = new Date(
          new Date(`${row.occurrence_date}T${b.end_time}`).toLocaleString("en-US", {
            timeZone: "America/Los_Angeles",
          }),
        );
        if (nowMs < lessonEnd.getTime()) {
          results.push({ id: row.id, ok: false, reason: "lesson_not_ended" });
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
      const amount = Math.round(Number(b.price_per_session || 65) * 100);
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
