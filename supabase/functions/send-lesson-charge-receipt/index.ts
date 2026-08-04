// Admin-triggered receipt for a single private lesson occurrence that was
// charged to the family's card on file after the booking was made without one.
// All receipt content is derived server-side from the charged row — the client
// only supplies the occurrence id. One receipt per occurrence, ever.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { getPrivateLessonPrice } from "../_shared/private-lesson-pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  occurrence_id: z.string().uuid(),
  environment: z.enum(["sandbox", "live"]),
});

const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

const REMINDER_KIND = "lesson_charge_receipt";

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function dateLabel(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function timeLabel(time: string | null): string {
  if (!time) return "";
  const [h, m] = String(time).split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
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
    const { occurrence_id, environment } = parsed.data;

    const { data: row, error: rErr } = await supabaseAdmin
      .from("lesson_booking_occurrences")
      .select(
        "id, booking_id, occurrence_date, payment_status, charge_status, lesson_bookings!inner(id, parent_name, parent_email, child_name, lesson_type, instructor_name, start_time, stripe_payment_method_id)",
      )
      .eq("id", occurrence_id)
      .maybeSingle();
    if (rErr || !row) return j({ error: "Occurrence not found" }, 404);
    if (row.charge_status !== "succeeded" && row.payment_status !== "paid") {
      return j({ error: "Occurrence has not been charged" }, 400);
    }

    const b = (row as unknown as { lesson_bookings: Record<string, unknown> }).lesson_bookings;
    const parentEmail = (b.parent_email as string | null) || "";
    if (!parentEmail) return j({ error: "Booking has no parent email" }, 400);

    // Never send a second receipt for the same occurrence.
    const { data: already } = await supabaseAdmin
      .from("reminder_logs")
      .select("id")
      .eq("lesson_occurrence_id", occurrence_id)
      .eq("reminder_kind", REMINDER_KIND)
      .eq("channel", "email")
      .maybeSingle();
    if (already) return j({ sent: false, reason: "already_sent" });

    // Card details straight from Stripe, not from the client.
    let cardBrand: string | null = null;
    let cardLast4: string | null = null;
    const pmId = b.stripe_payment_method_id as string | null;
    if (pmId) {
      try {
        const stripe = createStripeClient(environment as StripeEnv);
        const pm = await stripe.paymentMethods.retrieve(pmId);
        if (pm.card) {
          cardBrand = pm.card.brand;
          cardLast4 = pm.card.last4;
        }
      } catch (e) {
        console.warn("receipt: pm lookup failed", e instanceof Error ? e.message : String(e));
      }
    }

    const amountUsd = getPrivateLessonPrice(
      String(b.lesson_type || ""),
      row.occurrence_date as string,
    );

    const templateData = {
      parentName: b.parent_name ?? null,
      childName: b.child_name ?? null,
      lessonDateLabel: dateLabel(row.occurrence_date as string),
      lessonTimeLabel: timeLabel((b.start_time as string | null) ?? null),
      instructorName: b.instructor_name ?? null,
      amountUsd,
      cardBrand,
      cardLast4,
    };

    const { error: sendErr } = await supabaseAdmin.functions.invoke("send-transactional-email", {
      body: {
        templateName: "lesson-charge-receipt",
        recipientEmail: parentEmail,
        templateData,
        idempotencyKey: `lesson-charge-receipt:${occurrence_id}`,
      },
      headers: { Authorization: `Bearer ${SERVICE_ROLE}` },
    });
    if (sendErr) {
      await supabaseAdmin.from("reminder_logs").insert({
        lesson_occurrence_id: occurrence_id,
        booking_id: row.booking_id,
        channel: "email",
        reminder_kind: REMINDER_KIND,
        status: "failed",
        swimmer_name: (b.child_name as string | null) ?? null,
        error: sendErr.message,
      });
      return j({ sent: false, error: sendErr.message }, 502);
    }

    await supabaseAdmin.from("reminder_logs").insert({
      lesson_occurrence_id: occurrence_id,
      booking_id: row.booking_id,
      channel: "email",
      reminder_kind: REMINDER_KIND,
      status: "sent",
      sent_at: new Date().toISOString(),
      swimmer_name: (b.child_name as string | null) ?? null,
      message: `Receipt $${amountUsd.toFixed(2)} to ${parentEmail}`,
    });

    return j({ sent: true, recipient: parentEmail, amountUsd });
  } catch (err) {
    console.error("send-lesson-charge-receipt error", err);
    return j({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
