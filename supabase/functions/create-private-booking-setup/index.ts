// Creates lesson_bookings + lesson_booking_occurrences (pending),
// resolves/creates a Stripe Customer, returns an Embedded Checkout (setup mode) client_secret.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { getPrivateLessonPrice } from "../_shared/private-lesson-pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SlotSchema = z.object({
  instructor_id: z.string().uuid(),
  slot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
});

const BodySchema = z.object({
  environment: z.enum(["sandbox", "live"]),
  session_token: z.string().min(8).max(128),
  parent_first_name: z.string().min(1).max(80),
  parent_last_name: z.string().min(1).max(80),
  parent_email: z.string().email(),
  parent_phone: z.string().max(40).optional().nullable(),
  child_first_name: z.string().min(1).max(80),
  child_last_name: z.string().min(1).max(80),
  child_age: z.number().int().min(1).max(99),
  notes: z.string().max(1000).optional().nullable(),
  slots: z.array(SlotSchema).min(1).max(40),
  agreement: z.object({
    waiver_accepted: z.boolean(),
    photo_release_accepted: z.boolean(),
    privacy_policy_accepted: z.boolean(),
    terms_accepted: z.boolean(),
    signature_text: z.string().min(1).max(120),
    emergency_contact_first_name: z.string().min(1).max(80),
    emergency_contact_last_name: z.string().min(1).max(80),
    emergency_contact_phone: z.string().min(1).max(40),
    emergency_contact_relationship: z.string().min(1).max(60),
  }),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let step = "start";
  try {
    step = "parse_body";
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return j({ error: parsed.error.flatten(), step }, 400);
    const body = parsed.data;

    step = "validate_agreement";
    if (!body.agreement.waiver_accepted || !body.agreement.terms_accepted || !body.agreement.privacy_policy_accepted) {
      return j({ error: "Required agreements not accepted", step }, 400);
    }

    // Validate slots are still open: no conflicting occurrences or held slots.
    step = "check_slot_conflicts";
    const slotKeys = body.slots.map((s) => `${s.instructor_id}|${s.slot_date}|${s.start_time}`);
    const uniqInstructors = [...new Set(body.slots.map((s) => s.instructor_id))];
    const uniqDates = [...new Set(body.slots.map((s) => s.slot_date))];

    const { data: existing, error: existingErr } = await supabase
      .from("lesson_booking_occurrences")
      .select("occurrence_date, lesson_bookings!inner(instructor_id, start_time, status)")
      .in("occurrence_date", uniqDates)
      .neq("status", "cancelled")
      .neq("status", "pending_card");
    if (existingErr) throw existingErr;

    const taken = new Set<string>();
    for (const row of (existing as any[] | null) ?? []) {
      const lb = row.lesson_bookings;
      if (!lb?.instructor_id || !lb?.start_time) continue;
      taken.add(`${lb.instructor_id}|${row.occurrence_date}|${normalizeTime(lb.start_time)}`);
    }

    // NOTE: slot_holds are advisory-only (used to gray out the live picker).
    // We deliberately do NOT block booking on them — stale holds from a
    // refresh/retry would otherwise lock the same parent out for 10 min.
    // The lesson_booking_occurrences check above is the real double-book guard.

    const conflicts = slotKeys.filter((k) => taken.has(k.replace(/\|(\d{2}:\d{2})$/, (_, t) => `|${normalizeTime(t)}`)));
    if (conflicts.length) return j({ error: "slots_taken", conflicts, step: "check_slot_conflicts" }, 409);

    // Lookup instructor name (first slot used as primary on the booking row).
    step = "lookup_instructor";
    const { data: instructor } = await supabase
      .from("instructors").select("id, name").eq("id", body.slots[0].instructor_id).maybeSingle();
    const instructorName = (instructor as any)?.name ?? null;

    // Stripe customer
    step = "stripe_customer_lookup";
    const stripe = createStripeClient(body.environment as StripeEnv);
    const existingCustomers = await stripe.customers.list({ email: body.parent_email, limit: 1 });
    let customerId = existingCustomers.data[0]?.id;
    if (!customerId) {
      step = "stripe_customer_create";
      customerId = (await stripe.customers.create({
        email: body.parent_email,
        name: `${body.parent_first_name} ${body.parent_last_name}`,
        phone: body.parent_phone || undefined,
      })).id;
    }

    // Pick canonical start time = earliest, end = latest? For series we just stamp first slot.
    const sorted = [...body.slots].sort((a, b) => (a.slot_date + a.start_time).localeCompare(b.slot_date + b.start_time));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const bookingId = crypto.randomUUID();
    const parentName = `${body.parent_first_name} ${body.parent_last_name}`;
    const childName = `${body.child_first_name} ${body.child_last_name}`;

    // Create Stripe Checkout session FIRST so a Stripe failure doesn't leave
    // orphan pending_card rows in the DB that would later be miscounted as
    // taken slots.
    step = "stripe_checkout_session_create";
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      ui_mode: "embedded_page",
      customer: customerId,
      currency: "usd",
      payment_method_types: ["card"],
      redirect_on_completion: "never",
      metadata: { booking_id: bookingId, type: "private_lesson_card_on_file" },
    });

    step = "insert_lesson_booking";
    const { error: bErr } = await supabase.from("lesson_bookings").insert({
      id: bookingId,
      lesson_type: "private",
      parent_name: parentName,
      parent_first_name: body.parent_first_name,
      parent_last_name: body.parent_last_name,
      parent_email: body.parent_email,
      parent_phone: body.parent_phone,
      child_name: childName,
      child_first_name: body.child_first_name,
      child_last_name: body.child_last_name,
      child_age: body.child_age,
      price_per_session: getPrivateLessonPrice("private", first.slot_date),
      instructor_name: instructorName,
      instructor_id: body.slots[0].instructor_id,
      pool_area: "shallow",
      start_time: first.start_time,
      end_time: first.end_time,
      recurring: body.slots.length > 1,
      series_start: first.slot_date,
      series_end: last.slot_date,
      notes: body.notes ?? null,
      status: "pending_card",
      booking_source: "self_serve",
      stripe_customer_id: customerId,
      cancellation_policy_hours: 24,
    });
    if (bErr) throw bErr;

    step = "insert_occurrences";
    const occurrences = body.slots.map((s) => ({
      id: crypto.randomUUID(),
      booking_id: bookingId,
      occurrence_date: s.slot_date,
      payment_status: "card_on_file",
      auto_charge_status: "pending",
      status: "pending_card",
      cancel_token: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""),
    }));
    const { error: oErr } = await supabase.from("lesson_booking_occurrences").insert(occurrences);
    if (oErr) throw oErr;

    // Claim the slots: remove any slot_holds (from this or any other
    // session) that cover the booked instructor/date/time so subsequent
    // bookings aren't blocked by ghost holds.
    step = "cleanup_slot_holds";
    try {
      await Promise.all(body.slots.map((s) =>
        supabase.from("slot_holds")
          .delete()
          .eq("instructor_id", s.instructor_id)
          .eq("slot_date", s.slot_date)
          .eq("start_time", s.start_time)
      ));
    } catch (cleanupErr) {
      console.error("slot_holds cleanup failed (non-fatal)", (cleanupErr as any)?.message);
    }

    step = "insert_agreement";
    const { error: aErr } = await supabase.from("enrollment_agreements").insert({
      lesson_booking_id: bookingId,
      signer_first_name: body.parent_first_name,
      signer_last_name: body.parent_last_name,
      signer_name: parentName,
      signer_email: body.parent_email,
      signer_ip: req.headers.get("x-forwarded-for") || null,
      waiver_accepted: body.agreement.waiver_accepted,
      photo_release_accepted: body.agreement.photo_release_accepted,
      privacy_policy_accepted: body.agreement.privacy_policy_accepted,
      terms_accepted: body.agreement.terms_accepted,
      signature_text: body.agreement.signature_text,
      emergency_contact_first_name: body.agreement.emergency_contact_first_name,
      emergency_contact_last_name: body.agreement.emergency_contact_last_name,
      emergency_contact_name: `${body.agreement.emergency_contact_first_name} ${body.agreement.emergency_contact_last_name}`,
      emergency_contact_phone: body.agreement.emergency_contact_phone,
      emergency_contact_relationship: body.agreement.emergency_contact_relationship,
    });
    if (aErr) console.error("agreement insert failed (non-fatal)", aErr?.message);

    return j({
      booking_id: bookingId,
      client_secret: session.client_secret,
      checkout_session_id: session.id,
      customer_id: customerId,
    });
  } catch (err: any) {
    console.error("create-private-booking-setup error", {
      step,
      message: err?.message,
      code: err?.code,
      type: err?.type,
      stack: err?.stack,
    });
    return j({ error: err?.message || "Internal error", step, code: err?.code, type: err?.type }, 500);
  }
});

function normalizeTime(t: string): string {
  return t.length >= 8 ? t.substring(0, 5) : t;
}

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
