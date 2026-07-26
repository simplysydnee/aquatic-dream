// Report + send fresh Stripe Payment Links to families with unpaid private /
// semi-private lesson occurrences and no card on file.
//
// Modes:
//   dry_run: true  -> report only, nothing created, nothing texted
//   dry_run: false -> creates one Payment Link per family (covering all of
//                     their unpaid lessons), texts it, and reports back
//
// The link saves the card for future off-session charges, and the
// payments-webhook (`lesson_occurrence_multi`) marks every covered occurrence
// paid and stores the card on the family's bookings.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createStripeClient, type StripeEnv } from "../_shared/stripe.ts";
import { getPrivateLessonPrice, isPromoDate, PROMO_LABEL } from "../_shared/private-lesson-pricing.ts";
import { normalizePhone, sendSms, logSms, formatPTDate } from "../_shared/textmagic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEAD = ["cancelled", "abandoned"];

interface OccRow {
  id: string;
  booking_id: string;
  occurrence_date: string;
  status: string | null;
  payment_status: string | null;
  lesson_bookings: {
    id: string;
    status: string | null;
    booking_source: string | null;
    parent_name: string | null;
    parent_email: string | null;
    parent_phone: string | null;
    child_name: string | null;
    lesson_type: string | null;
    stripe_customer_id: string | null;
    stripe_payment_method_id: string | null;
  } | null;
}

interface FamilyReport {
  parent_name: string | null;
  parent_email: string | null;
  phone: string | null;
  swimmers: string[];
  lessons: { id: string; date: string; type: string | null; amount: number }[];
  total: number;
  has_card_on_file: boolean;
  payment_link: string | null;
  sms_status: "sent" | "failed" | "skipped" | "not_sent";
  error: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body?.dry_run !== false;
    const env: StripeEnv = body?.environment === "sandbox" ? "sandbox" : "live";
    const occurrenceIds: string[] | null = Array.isArray(body?.occurrence_ids) && body.occurrence_ids.length
      ? body.occurrence_ids
      : null;
    const includeCardOnFile: boolean = body?.include_card_on_file === true;
    const today = new Date().toISOString().slice(0, 10);

    let query = supabase
      .from("lesson_booking_occurrences")
      .select(
        "id, booking_id, occurrence_date, status, payment_status, lesson_bookings!inner(id, status, booking_source, parent_name, parent_email, parent_phone, child_name, lesson_type, stripe_customer_id, stripe_payment_method_id)",
      )
      .order("occurrence_date", { ascending: true });

    if (occurrenceIds) {
      query = query.in("id", occurrenceIds);
    } else {
      query = query
        .lte("occurrence_date", today)
        .not("payment_status", "eq", "paid")
        .not("status", "in", `(${DEAD.join(",")})`);
    }

    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);

    const rows = (data || []) as unknown as OccRow[];

    // Only real, unpaid, uncollected lessons.
    const eligible = rows.filter((r) => {
      const b = r.lesson_bookings;
      if (!b) return false;
      if (DEAD.includes(String(r.status)) || DEAD.includes(String(b.status))) return false;
      if (r.payment_status === "paid" || r.payment_status === "comp") return false;
      if (!includeCardOnFile && b.stripe_customer_id && b.stripe_payment_method_id) return false;
      return true;
    });

    // Group by family (parent email, falling back to phone).
    const families = new Map<string, OccRow[]>();
    for (const r of eligible) {
      const b = r.lesson_bookings!;
      const key = (b.parent_email || b.parent_phone || b.parent_name || b.id).toLowerCase();
      const list = families.get(key) || [];
      list.push(r);
      families.set(key, list);
    }

    const stripe = dryRun ? null : createStripeClient(env);
    const reports: FamilyReport[] = [];

    for (const [, occs] of families) {
      const b = occs[0].lesson_bookings!;
      const phone = normalizePhone(b.parent_phone);
      const lessons = occs.map((o) => ({
        id: o.id,
        date: o.occurrence_date,
        type: o.lesson_bookings!.lesson_type,
        amount: getPrivateLessonPrice(o.lesson_bookings!.lesson_type || "private", o.occurrence_date),
      }));
      const total = lessons.reduce((s, l) => s + l.amount, 0);
      const swimmers = Array.from(
        new Set(occs.map((o) => o.lesson_bookings!.child_name || "").filter(Boolean)),
      );

      const report: FamilyReport = {
        parent_name: b.parent_name,
        parent_email: b.parent_email,
        phone,
        swimmers,
        lessons,
        total,
        has_card_on_file: !!(b.stripe_customer_id && b.stripe_payment_method_id),
        payment_link: null,
        sms_status: "not_sent",
        error: null,
      };

      if (dryRun) {
        if (!phone) {
          report.sms_status = "skipped";
          report.error = "no_phone_on_file";
        }
        reports.push(report);
        continue;
      }

      try {
        const link = await stripe!.paymentLinks.create({
          line_items: lessons.map((l) => ({
            price_data: {
              currency: "usd",
              product_data: {
                name: `${l.type === "semi_private" ? "Semi-Private" : "Private"} Lesson${
                  l.type !== "semi_private" && isPromoDate(l.date) ? ` (${PROMO_LABEL})` : ""
                } — ${formatPTDate(l.date, { month: "short", day: "numeric", year: "numeric" })}`,
              },
              unit_amount: Math.round(l.amount * 100),
            },
            quantity: 1,
          })),
          customer_creation: "always",
          payment_intent_data: {
            setup_future_usage: "off_session",
            metadata: { type: "lesson_occurrence_multi", bookingId: b.id },
          },
          metadata: {
            type: "lesson_occurrence_multi",
            bookingId: b.id,
            occurrenceIds: lessons.map((l) => l.id).join(","),
          },
          after_completion: {
            type: "redirect",
            redirect: { url: "https://aquaticdreamsswim.com/?lesson_paid=1" },
          },
        });
        report.payment_link = link.url;
      } catch (e) {
        report.error = e instanceof Error ? e.message : String(e);
        report.sms_status = "failed";
        reports.push(report);
        continue;
      }

      if (!phone) {
        report.sms_status = "skipped";
        report.error = "no_phone_on_file";
        reports.push(report);
        continue;
      }

      const parentFirst = (b.parent_name || "").split(" ")[0] || "there";
      const swimmerLabel = swimmers.length ? swimmers.join(" & ") : "your swimmer";
      const dateList = lessons
        .map((l) => formatPTDate(l.date, { month: "numeric", day: "numeric" }))
        .join(", ");
      const message =
        `Hi ${parentFirst}, this is Aquatic Dreams. We still show a balance of $${total.toFixed(0)} for ${swimmerLabel}'s lesson${
          lessons.length > 1 ? "s" : ""
        } on ${dateList}. You can pay securely here: ${report.payment_link} — Reply STOP to opt out.`;

      const result = await sendSms(phone, message);
      report.sms_status = result.ok ? "sent" : "failed";
      report.error = result.ok ? null : result.error ?? "sms_failed";
      await logSms(supabase, {
        swimmer_name: swimmers[0] || null,
        booking_id: b.id,
        lesson_occurrence_id: lessons[0]?.id ?? null,
        phone,
        message,
        status: result.ok ? "sent" : "failed",
        error: report.error,
        reminder_kind: "lesson_payment_link_sms",
      });

      reports.push(report);
    }

    reports.sort((a, b) => (b.total - a.total));

    const summary = {
      dry_run: dryRun,
      environment: env,
      families: reports.length,
      lessons: reports.reduce((s, r) => s + r.lessons.length, 0),
      outstanding_total: reports.reduce((s, r) => s + r.total, 0),
      links_created: reports.filter((r) => r.payment_link).length,
      texts_sent: reports.filter((r) => r.sms_status === "sent").length,
      no_phone: reports.filter((r) => r.error === "no_phone_on_file").length,
      failures: reports.filter((r) => r.sms_status === "failed").length,
    };

    return json({ summary, families: reports });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-lesson-payment-links-batch error:", message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
