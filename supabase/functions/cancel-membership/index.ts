import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createStripeClient, type StripeEnv } from "../_shared/stripe.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// /join is currently pinned to sandbox — mirror that here.
const ENV: StripeEnv = "sandbox";

const PLAN_NAMES: Record<string, string> = {
  kid_group: "Small Group Swim",
  private: "Private Swim",
  adult_group: "Adult Swim",
};

const ALLOWED_REASONS = ["too_busy", "graduated", "cost", "moved", "other"] as const;
type Reason = (typeof ALLOWED_REASONS)[number];

// Returns the UNIX timestamp for the 1st of the month AFTER the given
// unix seconds, at 00:00 America/Los_Angeles. One more cycle bills on that
// next 1st; membership stays active through the end of that final paid
// month and cancels at the following 1st.
function firstOfMonthAfter(unixSeconds: number): number {
  const d = new Date(unixSeconds * 1000);
  // Move to the month AFTER current_period_end, then to the 1st of the
  // month AFTER that (i.e. end of the final paid month = start of the
  // month following the final paid month).
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  // final paid month = month + 1 (the one that bills on the next 1st)
  // cancel at start of month + 2 (LA midnight ≈ 08:00 UTC during PDT / 07:00 UTC otherwise; use 12:00 UTC to be safely inside the day)
  const target = new Date(Date.UTC(year, month + 2, 1, 12, 0, 0));
  return Math.floor(target.getTime() / 1000);
}

function fmtDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

async function sendEmail(templateName: string, recipientEmail: string, templateData: Record<string, unknown>, idempotencyKey: string) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ templateName, recipientEmail, idempotencyKey, purpose: "transactional", templateData }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[cancel-membership] ${templateName} email failed`, res.status, body.slice(0, 300));
    }
  } catch (e) {
    console.error(`[cancel-membership] ${templateName} email threw`, e);
  }
}

async function notifyAdminSms(text: string) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminPhone = Deno.env.get("ADMIN_ALERT_PHONE") || Deno.env.get("ADMIN_PHONE") || "";
    if (!adminPhone) return;
    await fetch(`${supabaseUrl}/functions/v1/send-sms-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ to: adminPhone, message: text }),
    });
  } catch (e) {
    console.error("[cancel-membership] admin SMS failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { token, reason, reasonDetail, dryRun } = await req.json();
    if (typeof token !== "string" || !token) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_REASONS.includes(reason as Reason)) {
      return new Response(JSON.stringify({ error: "Invalid reason" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const reasonDetailClean =
      typeof reasonDetail === "string" ? reasonDetail.slice(0, 1000) : null;

    const { data: m, error } = await supabase
      .from("memberships")
      .select("*")
      .eq("manage_token", token)
      .maybeSingle();

    if (error || !m) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: if already scheduled/cancelled, return current state.
    if (m.status === "pending_cancel" || m.status === "cancelled" || m.status === "canceled") {
      return new Response(
        JSON.stringify({
          ok: true,
          alreadyProcessed: true,
          effectiveDate: m.cancel_effective_date,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stripeSubId = m.stripe_subscription_id as string | null;
    if (!stripeSubId) {
      return new Response(JSON.stringify({ error: "No active subscription on file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = createStripeClient(ENV);
    const sub = await stripe.subscriptions.retrieve(stripeSubId);

    // Determine final charge date and final period end.
    // During trial: current_period_end == trial_end (next billing date).
    // After trial: current_period_end == next billing date.
    // We want to allow ONE more charge then cancel at end of that final paid month.
    const nextChargeUnix =
      sub.items?.data?.[0]?.current_period_end
      ?? sub.current_period_end
      ?? Math.floor(new Date(m.current_period_end).getTime() / 1000);
    const finalPeriodEndUnix = firstOfMonthAfter(nextChargeUnix);
    const cancelAt = Math.floor(finalPeriodEndUnix); // integer seconds
    if (!Number.isSafeInteger(cancelAt)) {
      throw new Error("Calculated cancellation timestamp is invalid");
    }
    const updateParams = {
      cancel_at: cancelAt,
      proration_behavior: "none" as const,
      metadata: {
        ...(sub.metadata || {}),
        cancel_reason: reason as string,
        cancel_requested_at: new Date().toISOString(),
      },
    };
    console.log("[cancel-membership] cancel_at", updateParams.cancel_at, typeof updateParams.cancel_at);

    const effectiveDate = new Date(cancelAt * 1000).toISOString().slice(0, 10);
    if (dryRun === true) {
      return new Response(
        JSON.stringify({ ok: true, dryRun: true, effectiveDate, cancelAt, cancelAtType: typeof cancelAt }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Schedule Stripe cancellation. cancel_at MUST be a unix timestamp
    // (integer seconds), not an ISO string. proration_behavior:'none'
    // prevents any partial refund on the final period.
    await stripe.subscriptions.update(stripeSubId, updateParams);

    const nowIso = new Date().toISOString();

    // Update membership.
    const { error: updErr } = await supabase
      .from("memberships")
      .update({
        status: "pending_cancel",
        cancel_requested_at: nowIso,
        cancel_effective_date: effectiveDate,
      })
      .eq("id", m.id);
    if (updErr) console.error("[cancel-membership] membership update failed", updErr);

    // Insert cancellation record.
    const { error: cancelErr } = await supabase
      .from("membership_cancellations")
      .insert({
        membership_id: m.id,
        requested_at: nowIso,
        effective_date: effectiveDate,
        reason,
        reason_detail: reasonDetailClean,
      });
    if (cancelErr) console.error("[cancel-membership] cancellation insert failed", cancelErr);

    const planName = PLAN_NAMES[String(m.plan_key)] || "swim";
    const familyName = (m.parent_first_name as string | null) || undefined;
    const swimmerName =
      [(m.child_first_name as string | null) || "", (m.child_last_name as string | null) || ""].join(" ").trim() ||
      undefined;
    const monthlyCents = Number(m.recurring_consent_amount_cents || 0);
    const monthlyPrice = monthlyCents > 0 ? `$${(monthlyCents / 100).toFixed(monthlyCents % 100 === 0 ? 0 : 2)}` : undefined;
    const finalChargeDate = fmtDate(nextChargeUnix);
    const effectiveEndDate = fmtDate(finalPeriodEndUnix);

    // Parent confirmation email.
    const parentEmail = m.parent_email as string | null;
    if (parentEmail) {
      await sendEmail(
        "membership-cancellation-confirmation",
        parentEmail,
        { familyName, swimmerName, programName: planName, finalChargeDate, effectiveEndDate, monthlyPrice },
        `membership-cancel-confirmation-${m.id}`,
      );
    }

    // Admin alert email + SMS.
    await sendEmail(
      "internal-membership-cancellation-alert",
      "info@aquaticdreamsswim.com",
      {
        familyName,
        swimmerName,
        programName: planName,
        parentEmail,
        parentPhone: m.parent_phone,
        reason,
        reasonDetail: reasonDetailClean,
        finalChargeDate,
        effectiveEndDate,
      },
      `membership-cancel-admin-${m.id}`,
    );

    await notifyAdminSms(
      `Cancellation requested: ${swimmerName || familyName || "member"} (${planName}). Final charge ${finalChargeDate}, ends ${effectiveEndDate}. Reason: ${reason}.`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        effectiveDate,
        finalChargeDate,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[cancel-membership] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
