// Admin-only: manually create a private or semi-private lesson booking
// (single date or recurring weekly series). Optionally:
//   - Email a confirmation with lesson dates, price, waiver link, and Add to Calendar links.
//   - Include a "Save card on file" link so parent can store a card via Stripe.
// Also supports `resend_confirmation_for: <booking_id>` to re-send for an existing booking.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { getPrivateLessonPrice, isJunePromoDate } from "../_shared/private-lesson-pricing.ts";
import { buildSessionCalendarLinks } from "../_shared/calendar-links.ts";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { sendAndLogBookingConfirmation, formatPTTime, formatPTDate } from "../_shared/textmagic.ts";
import {
  validateOccurrencesAgainstBlocks,
  formatAvailabilityError,
  type BookingBlock,
} from "../_shared/availability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CreateSchema = z.object({
  instructor_id: z.string().uuid(),
  lesson_type: z.enum(["private", "semi_private"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  pool_area: z.string().default("shallow"),
  parent_name: z.string().min(1).max(200),
  parent_first_name: z.string().max(80).optional().nullable(),
  parent_last_name: z.string().max(80).optional().nullable(),
  parent_email: z.string().email(),
  parent_phone: z.string().max(40).optional().nullable(),
  child_name: z.string().max(200).optional().nullable(),
  child_first_name: z.string().max(80).optional().nullable(),
  child_last_name: z.string().max(80).optional().nullable(),
  child_age: z.number().int().min(0).max(120).optional().nullable(),
  child_dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  recurring: z.boolean().default(false),
  series_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  // Optional explicit list of occurrence dates. When provided, overrides
  // the weekly-expansion logic so admins can deselect dates in the wizard.
  occurrence_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  price_per_session: z.number().positive().optional(),
  send_confirmation: z.boolean().default(true),
  collect_card_on_file: z.boolean().default(true),
  // Card-on-file resolution (set by client after embedded Setup Checkout completes)
  stripe_environment: z.enum(["sandbox", "live"]).optional(),
  stripe_customer_id: z.string().optional().nullable(),
  stripe_checkout_session_id: z.string().optional().nullable(),
  // Optional 2nd-swimmer info for semi-private bookings.
  partner_swimmer_first_name: z.string().max(80).optional().nullable(),
  partner_swimmer_last_name: z.string().max(80).optional().nullable(),
  partner_parent_name: z.string().max(200).optional().nullable(),
  partner_parent_email: z.string().email().optional().nullable(),
  partner_parent_phone: z.string().max(40).optional().nullable(),
});

const ResendSchema = z.object({
  resend_confirmation_for: z.string().uuid(),
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SITE_BASE = "https://aquaticdreamsswim.com";

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fmtTime(t: string) {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hh}:${String(m).padStart(2, "0")} ${period}`;
}

function fmtDate(dateISO: string) {
  return new Date(dateISO + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

async function sendConfirmationEmail(bookingId: string, includeCardOnFile: boolean) {
  // Fetch booking + occurrences
  const { data: booking, error: bErr } = await supabaseAdmin
    .from("lesson_bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr || !booking) throw new Error("Booking not found for email");

  const { data: occs } = await supabaseAdmin
    .from("lesson_booking_occurrences")
    .select("id, occurrence_date")
    .eq("booking_id", bookingId)
    .neq("status", "cancelled")
    .order("occurrence_date", { ascending: true });

  const dates = ((occs as any[]) || []).map((o) => o.occurrence_date);
  if (dates.length === 0) throw new Error("No occurrences to confirm");

  const lessonTypeLabel = (booking as any).lesson_type === "private" ? "Private Lesson" : "Semi-Private Lesson";
  const startTime = ((booking as any).start_time as string).slice(0, 5);
  const endTime = ((booking as any).end_time as string).slice(0, 5);
  const lessonTimeLabel = `${fmtTime(startTime)} – ${fmtTime(endTime)}`;

  // Per-date schedule with per-date pricing (June promo aware)
  const scheduleList = dates.map((d) => ({
    date: fmtDate(d),
    time: lessonTimeLabel,
  }));

  // Total price across dates
  let total = 0;
  let anyJune = false;
  for (const d of dates) {
    const p = getPrivateLessonPrice((booking as any).lesson_type, d);
    total += p;
    if (isJunePromoDate(d)) anyJune = true;
  }

  // Backstop: if waiver_signed_at is null on the booking, double-check
  // whether this swimmer already has a signed waiver on file via a prior
  // lesson booking (same parent_email + child name). If so, treat as
  // signed and suppress the waiver link in the confirmation email.
  let waiverSignedAt: string | null = (booking as any).waiver_signed_at ?? null;
  if (!waiverSignedAt && (booking as any).child_first_name && (booking as any).child_last_name && (booking as any).parent_email) {
    const { data: prior } = await supabaseAdmin
      .from("lesson_bookings")
      .select("waiver_signed_at")
      .ilike("parent_email", (booking as any).parent_email)
      .ilike("child_first_name", (booking as any).child_first_name)
      .ilike("child_last_name", (booking as any).child_last_name)
      .neq("id", bookingId)
      .not("waiver_signed_at", "is", null)
      .order("waiver_signed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if ((prior as any)?.waiver_signed_at) {
      waiverSignedAt = (prior as any).waiver_signed_at as string;
    }
  }

  const waiverLink = (booking as any).waiver_token && !waiverSignedAt
    ? `${SITE_BASE}/lesson-waiver/${(booking as any).waiver_token}`
    : undefined;

  const calTitle = `${(booking as any).child_name || (booking as any).parent_name || "Swim"} — ${lessonTypeLabel} (Aquatic Dreams)`;
  const calDesc = `${lessonTypeLabel} at Aquatic Dreams${
    (booking as any).instructor_name ? ` with ${(booking as any).instructor_name}` : ""
  }. Questions? (209) 577-3483 or info@aquaticdreamsswim.com`;

  const { icsUrl, googleUrl } = buildSessionCalendarLinks({
    uid: bookingId,
    title: calTitle,
    dates,
    start: startTime,
    end: endTime,
    location: "1212 Kansas Ave, Modesto, CA 95351",
    description: calDesc,
  });

  // Card on file: if requested, point the parent at the public booking
  // flow's setup intent. For now we surface a contact note since we don't
  // yet have a per-booking hosted setup URL.
  const cardOnFileNote = includeCardOnFile
    ? "We'll charge your card on file the day of each lesson (no charge today). Reply to this email if you need to update your payment method."
    : undefined;

  const promoNote = anyJune && (booking as any).lesson_type === "private"
    ? "🎉 June Promo Applied — private lessons are $50 (regular $65) for June dates."
    : undefined;

  let invokeFailure: string | null = null;
  try {
    const { data: invokeData, error: invokeErr } = await supabaseAdmin.functions.invoke("send-transactional-email", {
      body: {
        templateName: "lesson-booking-confirmation",
        recipientEmail: (booking as any).parent_email,
        idempotencyKey: `private-booking-${bookingId}-${dates.length}`,
        templateData: {
          parentName: (booking as any).parent_first_name || (booking as any).parent_name,
          childName: (booking as any).child_first_name || (booking as any).child_name,
          lessonTypeLabel,
          lessonTime: lessonTimeLabel,
          instructorName: (booking as any).instructor_name,
          totalOccurrences: dates.length,
          scheduleList,
          seriesMode: dates.length > 1,
          lessonDate: dates.length === 1 ? fmtDate(dates[0]) : undefined,
          totalAmountDue: `$${total.toFixed(2)}`,
          amountDue: dates.length === 1 ? `$${total.toFixed(2)}` : undefined,
          waiverLink,
          waiverSigned: !!waiverSignedAt,
          icsLink: icsUrl,
          googleCalendarLink: googleUrl,
          cardOnFileNote,
          promoNote,
        },
      },
    });
    const apiErr = (invokeData as any)?.error;
    if (invokeErr || apiErr) {
      invokeFailure = String(invokeErr?.message || apiErr || "unknown error");
      console.error("admin send-transactional-email failed", { bookingId, invokeErr, apiErr });
    }
  } catch (e: any) {
    invokeFailure = e?.message || String(e);
    console.error("admin send-transactional-email threw", { bookingId, error: invokeFailure });
  }

  await supabaseAdmin.from("lesson_bookings").update(
    invokeFailure
      ? { confirmation_email_status: "failed", confirmation_email_error: invokeFailure }
      : { confirmation_email_status: "sent", confirmation_email_sent_at: new Date().toISOString(), confirmation_email_error: null },
  ).eq("id", bookingId);

  // Semi-private: if the 2nd swimmer's parent has a different email, send
  // them a copy of the confirmation (best-effort, doesn't fail the booking).
  const partnerEmail = ((booking as any).partner_parent_email || "").toString().toLowerCase().trim();
  const primaryEmail = ((booking as any).parent_email || "").toString().toLowerCase().trim();
  if (partnerEmail && partnerEmail !== primaryEmail) {
    const partnerChild =
      (booking as any).partner_swimmer_first_name ||
      [(booking as any).partner_swimmer_first_name, (booking as any).partner_swimmer_last_name].filter(Boolean).join(" ") ||
      "your swimmer";
    try {
      await supabaseAdmin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "lesson-booking-confirmation",
          recipientEmail: partnerEmail,
          idempotencyKey: `private-booking-partner-${bookingId}-${dates.length}`,
          templateData: {
            parentName: (booking as any).partner_parent_name || undefined,
            childName: partnerChild,
            lessonTypeLabel,
            lessonTime: lessonTimeLabel,
            instructorName: (booking as any).instructor_name,
            totalOccurrences: dates.length,
            scheduleList,
            seriesMode: dates.length > 1,
            lessonDate: dates.length === 1 ? fmtDate(dates[0]) : undefined,
            totalAmountDue: `$${total.toFixed(2)}`,
            amountDue: dates.length === 1 ? `$${total.toFixed(2)}` : undefined,
            waiverSigned: true,
            icsLink: icsUrl,
            googleCalendarLink: googleUrl,
            cardOnFileNote,
            promoNote,
          },
        },
      });
    } catch (e: any) {
      console.error("partner-parent confirmation email failed", { bookingId, partnerEmail, error: e?.message || e });
    }
  }

  if (invokeFailure) throw new Error(invokeFailure);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
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

    const raw = await req.json();

    // RESEND path
    const resendParsed = ResendSchema.safeParse(raw);
    if (resendParsed.success) {
      try {
        await sendConfirmationEmail(resendParsed.data.resend_confirmation_for, true);
        return j({ success: true, resent: true });
      } catch (err: any) {
        return j({ error: err?.message || "Resend failed" }, 500);
      }
    }

    // CREATE path
    const parsed = CreateSchema.safeParse(raw);
    if (!parsed.success) return j({ error: parsed.error.flatten() }, 400);
    const p = parsed.data;

    const { data: instr } = await supabaseAdmin
      .from("instructors")
      .select("name")
      .eq("id", p.instructor_id)
      .maybeSingle();
    const instructorName = (instr as any)?.name || "Instructor";

    const defaultPrice = getPrivateLessonPrice(p.lesson_type, p.start_date);
    const price = p.price_per_session ?? defaultPrice;

    // Build occurrence dates
    const dates: string[] = [];
    if (p.occurrence_dates && p.occurrence_dates.length > 0) {
      // Explicit list from the wizard (already filtered by admin).
      const uniqSorted = Array.from(new Set(p.occurrence_dates)).sort();
      dates.push(...uniqSorted);
    } else {
      const start = new Date(p.start_date + "T00:00");
      if (p.recurring && p.series_end) {
        const end = new Date(p.series_end + "T00:00");
        const cur = new Date(start);
        while (cur <= end) {
          const y = cur.getFullYear();
          const m = String(cur.getMonth() + 1).padStart(2, "0");
          const d = String(cur.getDate()).padStart(2, "0");
          dates.push(`${y}-${m}-${d}`);
          cur.setDate(cur.getDate() + 7);
        }
      } else {
        dates.push(p.start_date);
      }
    }

    const seriesEnd = dates[dates.length - 1];
    const waiverToken =
      crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

    // Conflict check: don't allow admin to insert occurrences that overlap an
    // existing non-cancelled occurrence for the same effective instructor/time.
    {
      const startT = p.start_time.slice(0, 5);
      const endT = p.end_time.slice(0, 5);
      const { data: existing } = await supabaseAdmin
        .from("lesson_booking_occurrences")
        .select("occurrence_date, status, created_at, start_time_override, end_time_override, instructor_override_id, lesson_bookings!inner(instructor_id, start_time, end_time)")
        .in("occurrence_date", dates)
        .neq("status", "cancelled");
      const STALE_MS = 30 * 60 * 1000;
      const nowMs = Date.now();
      const conflicts: string[] = [];
      for (const d of dates) {
        for (const row of (existing as any[]) || []) {
          if (row.occurrence_date !== d) continue;
          if (row.status === "pending_card" && row.created_at && (nowMs - new Date(row.created_at).getTime()) > STALE_MS) continue;
          const lb = row.lesson_bookings;
          const instId = row.instructor_override_id || lb?.instructor_id;
          if (instId !== p.instructor_id) continue;
          const cs = (row.start_time_override || lb?.start_time || "").slice(0, 5);
          const ce = (row.end_time_override || lb?.end_time || "").slice(0, 5);
          if (startT < ce && endT > cs) {
            conflicts.push(`${d} ${cs}-${ce}`);
            break;
          }
        }
      }
      if (conflicts.length) {
        return j({ error: `This instructor already has a lesson at that time on: ${conflicts.join(", ")}` }, 409);
      }
    }


    // Dedupe waiver: if this swimmer already has a signed waiver on file
    // (matched by first + last name + DOB across visitor waivers, swim
    // enrollment agreements, or prior lesson bookings), inherit that
    // signed_at so we don't ask the parent to sign again.
    let inheritedWaiverSignedAt: string | null = null;
    if (p.child_first_name && p.child_last_name && p.child_dob) {
      const { data: signedAt } = await supabaseAdmin.rpc(
        "get_active_waiver_signed_at_for_swimmer",
        { _first: p.child_first_name, _last: p.child_last_name, _dob: p.child_dob },
      );
      if (signedAt) inheritedWaiverSignedAt = signedAt as string;
    }
    // Fallback: when DOB is missing or the RPC didn't match, look up a
    // prior lesson booking for this parent + swimmer by name. This covers
    // quick-book flows that skip DOB so we don't re-prompt for a waiver
    // when one is clearly already on file.
    if (!inheritedWaiverSignedAt && p.child_first_name && p.child_last_name) {
      const { data: prior } = await supabaseAdmin
        .from("lesson_bookings")
        .select("waiver_signed_at")
        .ilike("parent_email", p.parent_email)
        .ilike("child_first_name", p.child_first_name)
        .ilike("child_last_name", p.child_last_name)
        .not("waiver_signed_at", "is", null)
        .order("waiver_signed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if ((prior as any)?.waiver_signed_at) {
        inheritedWaiverSignedAt = (prior as any).waiver_signed_at as string;
      }
    }

    // If admin captured a card via Stripe Setup Checkout, resolve the
    // payment method now and stamp it on the booking. We never want a
    // "card_on_file" booking row without a real card attached.
    let stripePaymentMethodId: string | null = null;
    let stripeCustomerId: string | null = p.stripe_customer_id || null;
    if (p.collect_card_on_file && p.stripe_checkout_session_id) {
      const env = (p.stripe_environment || "live") as StripeEnv;
      const stripe = createStripeClient(env);
      const cs = await stripe.checkout.sessions.retrieve(p.stripe_checkout_session_id);
      if (cs.status !== "complete" || !cs.setup_intent) {
        return j({ error: `Card setup not complete: ${cs.status}` }, 400);
      }
      const siId = typeof cs.setup_intent === "string" ? cs.setup_intent : cs.setup_intent.id;
      const si = await stripe.setupIntents.retrieve(siId);
      if (si.status !== "succeeded" || !si.payment_method) {
        return j({ error: `Card setup not ready: ${si.status}` }, 400);
      }
      stripePaymentMethodId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method.id;
      if (!stripeCustomerId) {
        stripeCustomerId = typeof cs.customer === "string" ? cs.customer : (cs.customer?.id ?? null);
      }
    } else if (p.collect_card_on_file && !p.stripe_checkout_session_id) {
      return j({ error: "Card on file required but no Stripe checkout session was provided" }, 400);
    }

    const { data: booking, error: bErr } = await supabaseAdmin
      .from("lesson_bookings")
      .insert({
        lesson_type: p.lesson_type,
        instructor_id: p.instructor_id,
        instructor_name: instructorName,
        parent_name: p.parent_name,
        parent_first_name: p.parent_first_name || null,
        parent_last_name: p.parent_last_name || null,
        parent_email: p.parent_email,
        parent_phone: p.parent_phone || null,
        child_name: p.child_name || null,
        child_first_name: p.child_first_name || null,
        child_last_name: p.child_last_name || null,
        child_age: p.child_age ?? null,
        child_dob: p.child_dob || null,
        start_time: p.start_time,
        end_time: p.end_time,
        pool_area: p.pool_area,
        price_per_session: price,
        series_start: dates[0],
        series_end: seriesEnd,
        recurring: !!p.recurring || dates.length > 1,
        frequency: (p.recurring || dates.length > 1) ? "weekly" : null,
        notes: p.notes || null,
        status: "active",
        booking_source: "admin",
        waiver_token: waiverToken,
        waiver_signed_at: inheritedWaiverSignedAt,
        cancellation_policy_hours: 24,
        stripe_customer_id: stripeCustomerId,
        stripe_payment_method_id: stripePaymentMethodId,
        partner_swimmer_first_name: p.partner_swimmer_first_name || null,
        partner_swimmer_last_name: p.partner_swimmer_last_name || null,
        partner_parent_name: p.partner_parent_name || null,
        partner_parent_email: p.partner_parent_email || null,
        partner_parent_phone: p.partner_parent_phone || null,
      })
      .select("id")
      .single();
    if (bErr) throw bErr;

    const bookingId = (booking as any).id;

    const occRows = dates.map((d) => ({
      booking_id: bookingId,
      occurrence_date: d,
      status: "scheduled",
      payment_status: p.collect_card_on_file ? "card_on_file" : "unpaid",
      charge_status: p.collect_card_on_file ? "pending" : "skipped",
    }));
    const { error: oErr } = await supabaseAdmin
      .from("lesson_booking_occurrences")
      .insert(occRows);
    if (oErr) {
      await supabaseAdmin.from("lesson_bookings").delete().eq("id", bookingId);
      throw oErr;
    }

    // Send confirmation email (best-effort — booking already created).
    //   - Card on file: send the bundled confirmation w/ "card will be
    //     charged day-of" note (no payment link). Auto-charge cron handles
    //     the actual charge.
    //   - No card: route through the wrapper so the email includes a
    //     Stripe payment link (single occurrence) or a combined series
    //     link (recurring), plus the waiver link if unsigned.
    let emailSent = false;
    let emailError: string | undefined;
    if (p.send_confirmation) {
      try {
        if (p.collect_card_on_file) {
          await sendConfirmationEmail(bookingId, true);
        } else {
          const env = (p.stripe_environment || "live") as StripeEnv;
          const fnName = dates.length > 1
            ? "send-lesson-series-confirmation"
            : "send-lesson-booking-confirmation";
          const body: Record<string, unknown> = { environment: env, siteUrl: SITE_BASE };
          if (dates.length > 1) {
            body.bookingId = bookingId;
          } else {
            const { data: firstOcc } = await supabaseAdmin
              .from("lesson_booking_occurrences")
              .select("id")
              .eq("booking_id", bookingId)
              .order("occurrence_date", { ascending: true })
              .limit(1)
              .maybeSingle();
            body.occurrenceId = (firstOcc as any)?.id;
          }
          const { error: invokeErr } = await supabaseAdmin.functions.invoke(fnName, { body });
          if (invokeErr) throw invokeErr;
        }
        emailSent = true;
      } catch (err: any) {
        emailError = err?.message || String(err);
        console.error("Confirmation email failed:", emailError);
      }
    }

    // Booking confirmation SMS (best-effort; initial create only).
    try {
      console.log("[sms] admin-create-private-booking start", bookingId);
      const firstDate = dates[0];
      const { data: firstOcc } = await supabaseAdmin
        .from("lesson_booking_occurrences")
        .select("id")
        .eq("booking_id", bookingId)
        .eq("occurrence_date", firstDate)
        .limit(1)
        .maybeSingle();
      const instructorFirst = (instructorName || "").split(" ")[0] || "your instructor";
      const swimmerFirst = p.child_first_name || (p.child_name || "").split(" ")[0] || null;
      const dateLabel = formatPTDate(firstDate);
      const timeLabel = formatPTTime(p.start_time);
      const message = `Your lesson with ${instructorFirst} on ${dateLabel} at ${timeLabel} is confirmed at Aquatic Dreams. See you there!`;
      const result = await sendAndLogBookingConfirmation(supabaseAdmin, {
        phoneRaw: p.parent_phone,
        message,
        swimmer_name: swimmerFirst,
        booking_id: bookingId,
        lesson_occurrence_id: (firstOcc as any)?.id ?? null,
        reminder_kind: "booking_confirmation",
      });
      console.log("[sms] admin-create-private-booking result", bookingId, JSON.stringify(result));
    } catch (smsErr) {
      console.error("admin-create-private-booking SMS step failed:", smsErr instanceof Error ? smsErr.message : String(smsErr));
    }

    return j({
      success: true,
      booking_id: bookingId,
      occurrences: dates.length,
      email_sent: emailSent,
      email_error: emailError,
      waiver_link: `${SITE_BASE}/lesson-waiver/${waiverToken}`,
    });
  } catch (err: any) {
    console.error("admin-create-private-booking error", err);
    return j({ error: err?.message || "Internal error" }, 500);
  }
});
