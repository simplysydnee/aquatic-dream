// Verifies SetupIntent succeeded, stores payment_method_id, flips booking to active,
// sends confirmation email, releases slot holds.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { buildSessionCalendarLinks } from "../_shared/calendar-links.ts";
import { getPrivateLessonPrice } from "../_shared/private-lesson-pricing.ts";


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
      const occList = ((occs as any[]) || []);
      const schedule = occList.map((o) => ({
        date: new Date(o.occurrence_date + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "long", month: "long", day: "numeric", year: "numeric",
        }),
        time: `${formatTime(b.start_time)} – ${formatTime(b.end_time)}`,
      }));

      let icsLink: string | undefined;
      let googleCalendarLink: string | undefined;
      if (occList.length > 0 && b.start_time && b.end_time) {
        const titleParts = [
          b.child_first_name || b.child_name ? `${b.child_first_name || b.child_name}'s Private Lesson` : "Private Lesson",
          "— Aquatic Dreams",
        ];
        const links = buildSessionCalendarLinks({
          uid: `private-booking-${booking_id}`,
          title: titleParts.join(" "),
          dates: occList.map((o) => o.occurrence_date),
          start: b.start_time,
          end: b.end_time,
          location: "1212 Kansas Ave, Modesto, CA 95351",
          description: `Private swim lesson with ${b.instructor_name || "your instructor"}. Questions: info@aquaticdreamsswim.com / (209) 577-3483`,
        });
        icsLink = links.icsUrl;
        googleCalendarLink = links.googleUrl;
      }

      const emailBody = {
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
          totalAmountDue: (() => {
            const perPrices = occList.map((o) => getPrivateLessonPrice(b.lesson_type, o.occurrence_date));
            const total = perPrices.reduce((s, p) => s + p, 0);
            const allSame = perPrices.every((p) => p === perPrices[0]);
            if (allSame) {
              return `$${total.toFixed(2)} (charged $${perPrices[0].toFixed(0)} the day of each lesson)`;
            }
            return `$${total.toFixed(2)} total — June lessons $50 each, other lessons $65 each, charged the day of each lesson`;
          })(),
          scheduleList: schedule,
          lessonDate: schedule[0]?.date,
          lessonTime: schedule[0]?.time,
          amountDue: `$${getPrivateLessonPrice(b.lesson_type, occList[0]?.occurrence_date || b.series_start).toFixed(0)}`,
          waiverSigned: true,
          icsLink,
          googleCalendarLink,
        },
      };

      let emailErrorMsg: string | null = null;
      try {
        const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
          "send-transactional-email",
          { body: emailBody },
        );
        const apiErr = (invokeData as any)?.error;
        if (invokeErr || apiErr) {
          emailErrorMsg = String(invokeErr?.message || apiErr || "unknown error");
          console.error("confirmation email failed", { booking_id, recipient: b.parent_email, invokeErr, apiErr });
        }
      } catch (e: any) {
        emailErrorMsg = e?.message || String(e);
        console.error("confirmation email threw", { booking_id, error: emailErrorMsg });
      }

      await supabase.from("lesson_bookings").update(
        emailErrorMsg
          ? { confirmation_email_status: "failed", confirmation_email_error: emailErrorMsg }
          : { confirmation_email_status: "sent", confirmation_email_sent_at: new Date().toISOString(), confirmation_email_error: null },
      ).eq("id", booking_id);
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
