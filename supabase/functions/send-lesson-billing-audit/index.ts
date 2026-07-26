// Daily billing audit for private / semi-private lessons.
//
// Runs each morning (pg_cron) and emails staff a report of the previous day's
// lessons with the real payment status verified against Stripe — not just the
// database flag. Report-only: never charges a card, never writes to the DB.
//
// Body options (all optional):
//   { date: "2026-07-25" }  audit a specific date instead of yesterday
//   { dry_run: true }       return the JSON report without emailing
//   { recipients: ["a@b.com"] }  override the default staff recipients
import { createClient } from "npm:@supabase/supabase-js@2";
import { createStripeClient, type StripeEnv } from "../_shared/stripe.ts";
import { getPrivateLessonPrice } from "../_shared/private-lesson-pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_RECIPIENTS = [
  "sutton@aquaticdreams.com",
  "sydnee@icanswim209.com",
];

const DEAD = ["cancelled", "abandoned"];
const STALE_PENDING_MS = 15 * 60 * 1000;
const OFFLINE_METHODS = ["cash", "check", "comp", "invoice", "other"];

interface AuditLine {
  swimmer: string;
  parentName: string;
  parentPhone: string;
  lessonType: string;
  time: string;
  instructor: string;
  amount: number;
  detail: string;
  stripeLabel?: string;
  stripeRef?: string;
  stripeUrl?: string;
}

const isSemi = (t: string | null | undefined): boolean =>
  String(t || "").replace(/-/g, "_") === "semi_private";

const typeLabel = (t: string | null | undefined): string =>
  isSemi(t) ? "Semi-private" : "Private";

const isAdminSource = (s: string | null | undefined): boolean =>
  s === "admin" || s === "admin_manual";

function ptDateString(offsetDays = 0): string {
  const pt = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  pt.setDate(pt.getDate() + offsetDays);
  const y = pt.getFullYear();
  const m = String(pt.getMonth() + 1).padStart(2, "0");
  const d = String(pt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function timeLabel(t: string | null | undefined): string {
  if (!t) return "";
  const [hStr, mStr] = String(t).split(":");
  let h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mStr} ${suffix}`;
}

function paymentUrl(id: string): string {
  if (id.startsWith("pi_")) return `https://dashboard.stripe.com/payments/${id}`;
  if (id.startsWith("cs_")) return `https://dashboard.stripe.com/checkout/sessions/${id}`;
  return `https://dashboard.stripe.com/search?query=${encodeURIComponent(id)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth gate: service-role (pg_cron), CRON_SECRET, or a signed-in admin.
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret") || "";
  const isServiceRole = !!bearer && bearer === SERVICE_ROLE;
  const isCronSecret = !!cronSecret && providedSecret === cronSecret;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_ROLE);

  if (!isServiceRole && !isCronSecret) {
    let allowed = false;
    if (bearer) {
      const { data: userData } = await supabase.auth.getUser(bearer);
      if (userData?.user) {
        const { data: isAdmin } = await supabase.rpc("has_role", {
          _user_id: userData.user.id,
          _role: "admin",
        });
        allowed = isAdmin === true;
      }
    }
    if (!allowed) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const targetDate: string =
      typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : ptDateString(-1);
    const dryRun: boolean = body?.dry_run === true;
    const env: StripeEnv = body?.environment === "sandbox" ? "sandbox" : "live";
    const recipients: string[] = Array.isArray(body?.recipients) && body.recipients.length
      ? body.recipients
      : DEFAULT_RECIPIENTS;

    const { data, error } = await supabase
      .from("lesson_booking_occurrences")
      .select(
        "id, occurrence_date, status, payment_status, payment_method, payment_reference, " +
          "stripe_payment_intent_id, stripe_session_id, charge_status, charge_error, " +
          "payment_link_sent_at, start_time_override, instructor_override_name, " +
          "lesson_bookings!inner(id, status, booking_source, created_at, parent_name, parent_phone, " +
          "child_name, lesson_type, start_time, instructor_name, stripe_customer_id, stripe_payment_method_id)",
      )
      .eq("occurrence_date", targetDate)
      .order("start_time_override", { ascending: true, nullsFirst: false });

    if (error) return json({ error: error.message }, 500);

    const now = Date.now();
    const rows = (data || []) as unknown as Record<string, any>[];

    // Private / semi-private only, abandoned carts excluded.
    const relevant = rows.filter((r) => {
      const b = r.lesson_bookings;
      if (!b) return false;
      const t = String(b.lesson_type || "").replace(/-/g, "_");
      if (t !== "private" && t !== "semi_private") return false;
      if (b.status === "abandoned" || r.status === "abandoned") return false;
      if (r.status === "pending_card" || b.status === "pending_card") {
        if (!isAdminSource(b.booking_source)) {
          const created = b.created_at ? new Date(b.created_at).getTime() : 0;
          if (now - created > STALE_PENDING_MS) return false;
        }
      }
      return true;
    });

    const stripe = createStripeClient(env);

    const unbilled: AuditLine[] = [];
    const paid: AuditLine[] = [];
    const noCharge: AuditLine[] = [];
    let collected = 0;
    let outstanding = 0;

    for (const r of relevant) {
      const b = r.lesson_bookings;
      const amount = getPrivateLessonPrice(b.lesson_type || "private", r.occurrence_date);
      const base: AuditLine = {
        swimmer: b.child_name || b.parent_name || "Unknown swimmer",
        parentName: b.parent_name || "",
        parentPhone: b.parent_phone || "",
        lessonType: typeLabel(b.lesson_type),
        time: timeLabel(r.start_time_override || b.start_time),
        instructor: r.instructor_override_name || b.instructor_name || "",
        amount,
        detail: "",
      };

      // Cancelled lessons: informational only.
      if (DEAD.includes(String(r.status)) || DEAD.includes(String(b.status))) {
        noCharge.push({ ...base, amount: 0, detail: "Cancelled — no charge expected" });
        continue;
      }

      // Comped lessons.
      if (r.payment_status === "comp" || r.payment_method === "comp") {
        noCharge.push({ ...base, amount: 0, detail: "Comped — no charge expected" });
        continue;
      }

      const piId: string | null = r.stripe_payment_intent_id || null;
      const csId: string | null = r.stripe_session_id || null;

      // --- Verify against Stripe when we have a reference ---
      if (piId || csId) {
        let stripeOk = false;
        let stripeState = "";
        let stripeErr = "";
        let ref = piId || csId!;
        try {
          if (piId) {
            const pi = await stripe.paymentIntents.retrieve(piId);
            stripeState = pi.status;
            stripeOk = pi.status === "succeeded";
            stripeErr = pi.last_payment_error?.message || "";
          } else {
            const cs = await stripe.checkout.sessions.retrieve(csId!);
            stripeState = cs.payment_status || cs.status || "unknown";
            stripeOk = cs.payment_status === "paid";
            if (typeof cs.payment_intent === "string") ref = cs.payment_intent;
          }
        } catch (e) {
          stripeState = "lookup_failed";
          stripeErr = e instanceof Error ? e.message : String(e);
        }

        const line: AuditLine = {
          ...base,
          stripeLabel: piId ? "card charge" : "payment link",
          stripeRef: ref,
          stripeUrl: paymentUrl(ref),
        };

        if (stripeOk) {
          const mismatch = r.payment_status !== "paid"
            ? " — DB still shows unpaid, needs reconciling"
            : "";
          line.detail = `Paid · Stripe confirms ${stripeState}${mismatch}`;
          collected += amount;
          paid.push(line);
        } else {
          const dbSaysPaid = r.payment_status === "paid";
          line.detail = `NOT PAID · Stripe status: ${stripeState}${
            stripeErr ? ` (${stripeErr})` : ""
          }${dbSaysPaid ? " — DB shows paid, mismatch" : ""}`;
          outstanding += amount;
          unbilled.push(line);
        }
        continue;
      }

      // --- No Stripe reference ---
      const method = String(r.payment_method || "").toLowerCase();
      if (OFFLINE_METHODS.includes(method)) {
        collected += amount;
        paid.push({
          ...base,
          detail: `Paid offline · ${method}${
            r.payment_reference ? ` (${r.payment_reference})` : ""
          }`,
        });
        continue;
      }

      const hasCard = !!(b.stripe_customer_id && b.stripe_payment_method_id);
      let reason: string;
      if (r.charge_status === "failed") {
        reason = `Charge failed${r.charge_error ? ` · ${r.charge_error}` : ""}`;
      } else if (r.payment_link_sent_at) {
        reason = "Payment link sent but never completed";
      } else if (hasCard) {
        reason = "Never charged · card on file, ready to run";
      } else {
        reason = "Never charged · no card on file";
      }
      outstanding += amount;
      unbilled.push({ ...base, detail: reason });
    }

    const templateData = {
      dateLabel: dateLabel(targetDate),
      unbilled,
      paid,
      noCharge,
      totalLessons: relevant.length,
      collected,
      outstanding,
    };

    if (relevant.length === 0) {
      return json({ date: targetDate, lessons: 0, emailed: false, reason: "no_lessons" });
    }

    if (dryRun) {
      return json({ date: targetDate, dry_run: true, report: templateData });
    }

    const emailed: string[] = [];
    for (const recipient of recipients) {
      const { error: invokeErr } = await supabase.functions.invoke(
        "send-transactional-email",
        {
          body: {
            templateName: "lesson-billing-audit",
            recipientEmail: recipient,
            idempotencyKey: `lesson-billing-audit-${targetDate}-${recipient}`,
            templateData,
          },
        },
      );
      if (invokeErr) {
        console.error("billing audit email failed for", recipient, invokeErr.message);
      } else {
        emailed.push(recipient);
      }
    }

    return json({
      date: targetDate,
      lessons: relevant.length,
      unbilled: unbilled.length,
      paid: paid.length,
      outstanding,
      collected,
      emailed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-lesson-billing-audit error:", message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
