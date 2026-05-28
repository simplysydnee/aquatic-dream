// Verifies SetupIntent succeeded, stores payment_method_id, flips booking to active,
// sends confirmation email, releases slot holds.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  environment: z.enum(["sandbox", "live"]),
  booking_id: z.string().uuid(),
  setup_intent_id: z.string().min(3),
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
    const { environment, booking_id, setup_intent_id, session_token } = parsed.data;

    const stripe = createStripeClient(environment as StripeEnv);
    const si = await stripe.setupIntents.retrieve(setup_intent_id);
    if (si.status !== "succeeded" || !si.payment_method) {
      return j({ error: `SetupIntent not ready: ${si.status}` }, 400);
    }

    const paymentMethodId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method.id;

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

    // Fetch booking + occurrences for email
    const { data: booking } = await supabase
      .from("lesson_bookings").select("*").eq("id", booking_id).maybeSingle();
    const { data: occs } = await supabase
      .from("lesson_booking_occurrences").select("occurrence_date")
      .eq("booking_id", booking_id).order("occurrence_date");

    if (booking) {
      const b: any = booking;
      const schedule = ((occs as any[]) || []).map((o) => ({
        date: new Date(o.occurrence_date + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "long", month: "long", day: "numeric", year: "numeric",
        }),
        time: `${formatTime(b.start_time)} – ${formatTime(b.end_time)}`,
      }));

      supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "lesson-booking-confirmation",
          recipientEmail: b.parent_email,
          idempotencyKey: `private-booking-${booking_id}`,
          templateData: {
            parentName: b.parent_first_name || b.parent_name,
            childName: b.child_first_name || b.child_name,
            lessonTypeLabel: "Private Lesson",
            instructorName: b.instructor_name,
            seriesMode: schedule.length > 1,
            totalOccurrences: schedule.length,
            totalAmountDue: `$${(schedule.length * Number(b.price_per_session)).toFixed(2)} (charged $${Number(b.price_per_session).toFixed(0)} after each lesson)`,
            scheduleList: schedule,
            lessonDate: schedule[0]?.date,
            lessonTime: schedule[0]?.time,
            amountDue: `$${Number(b.price_per_session).toFixed(0)}`,
            waiverSigned: true,
          },
        },
      }).catch((e) => console.error("confirmation email failed", e));
    }

    return j({ success: true, booking_id });
  } catch (err: any) {
    console.error("confirm-private-booking error", err);
    return j({ error: err?.message || "Internal error" }, 500);
  }
});

function formatTime(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hh = parseInt(h, 10);
  const ampm = hh >= 12 ? "PM" : "AM";
  const display = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${display}:${m} ${ampm}`;
}

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
