// Admin one-off: create a Stripe setup-mode hosted Checkout Session for an
// existing pending_card lesson_bookings row, store the URL on the booking,
// and email the parent a link to save their card on file.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createStripeClient, type StripeEnv } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { bookingId, environment, siteUrl, amountLabel } = await req.json();
    if (!bookingId) return j({ error: "bookingId is required" }, 400);

    const { data: booking, error: bErr } = await supabase
      .from("lesson_bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();
    if (bErr || !booking) return j({ error: "Booking not found" }, 404);

    const env = (environment || "sandbox") as StripeEnv;
    const stripe = createStripeClient(env);

    // Lookup-or-create Stripe customer by parent email
    let customerId = booking.stripe_customer_id as string | undefined;
    if (!customerId) {
      const existing = await stripe.customers.list({ email: booking.parent_email, limit: 1 });
      customerId = existing.data[0]?.id
        ?? (await stripe.customers.create({
          email: booking.parent_email,
          name: booking.parent_name || undefined,
          phone: booking.parent_phone || undefined,
        })).id;
    }

    const returnBase = siteUrl || "https://aquaticdreamsswim.com";
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      ui_mode: "hosted_page",
      customer: customerId,
      currency: "usd",
      payment_method_types: ["card"],
      success_url: `${returnBase}/?card_saved=1`,
      cancel_url: `${returnBase}/`,
      expires_at: Math.floor(Date.now() / 1000) + 23 * 60 * 60,
      metadata: { booking_id: bookingId, type: "private_lesson_card_on_file" },
    });

    const paymentLink = session.url;
    if (!paymentLink) return j({ error: "Stripe returned no URL" }, 502);

    await supabase
      .from("lesson_bookings")
      .update({ stripe_customer_id: customerId })
      .eq("id", bookingId);

    const amt = amountLabel || "$50";
    const dateStr = new Date(booking.series_start + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });
    const timeStr = (booking.start_time || "").slice(0, 5);

    const body = [
      `${booking.child_name}'s private swim lesson with ${booking.instructor_name} is booked for ${dateStr} at ${timeStr}.`,
      "",
      `Please save a card on file using the secure link below. No charge today — we'll automatically charge ${amt} on the day of the lesson.`,
      "",
      paymentLink,
      "",
      "You can cancel up to 24 hours before the lesson at no charge. No-shows and late cancellations are charged in full.",
      "",
      "See you at the pool!",
    ].join("\n");

    const { error: emailErr } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "admin-freeform",
        recipientEmail: booking.parent_email,
        idempotencyKey: `private-booking-card-${bookingId}-${Date.now()}`,
        templateData: {
          parentName: booking.parent_name,
          subject: `Save your card for ${booking.child_name}'s swim lesson with ${booking.instructor_name}`,
          body,
        },
      },
    });
    if (emailErr) console.error("email invoke error", emailErr);

    return j({ success: true, paymentLink, customerId });
  } catch (err: any) {
    console.error("admin-card-on-file-link error", err?.message, err?.stack);
    return j({ error: err?.message || "Internal error" }, 500);
  }
});
