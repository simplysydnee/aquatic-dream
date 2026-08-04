// Read-only membership payment reconciliation.
//
// Compares Stripe against our membership records for a trailing window and
// returns three buckets of rows that need human eyes. This function performs
// ZERO writes: no auto-correction, no charges, no refunds.
//
// Auth: requires a Supabase session whose user has the 'admin' role.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Row = {
  kind: string;
  stripeId: string | null;
  stripeUrl: string | null;
  membershipId: string | null;
  swimmer: string | null;
  parentEmail: string | null;
  amountCents: number | null;
  occurredAt: string | null;
  detail: string;
};

const DAYS = 60;

function serverEnvironment(): StripeEnv {
  return Deno.env.get("PAYMENTS_ENV") === "sandbox" ? "sandbox" : "live";
}

function stripeUrl(env: StripeEnv, path: string, id: string): string {
  const base = env === "sandbox" ? "https://dashboard.stripe.com/test" : "https://dashboard.stripe.com";
  return `${base}/${path}/${id}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin, error: roleErr } = await supabaseAdmin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) return json({ error: "Forbidden: admin role required" }, 403);

    const env = serverEnvironment();
    const stripe = createStripeClient(env);
    const since = Math.floor(Date.now() / 1000) - DAYS * 86400;
    const sinceIso = new Date(since * 1000).toISOString();

    // ---- our records (memberships only; lesson_bookings is out of scope) ----
    const { data: memberships, error: mErr } = await supabaseAdmin
      .from("memberships")
      .select(
        "id, child_first_name, child_last_name, parent_email, status, plan_key, start_date, " +
          "stripe_subscription_id, stripe_customer_id, current_period_start, current_period_end, " +
          "recurring_consent_amount_cents, created_at",
      );
    if (mErr) throw new Error(`memberships read failed: ${mErr.message}`);

    const { data: ledger } = await supabaseAdmin
      .from("membership_payment_events")
      .select("membership_id, event_type, amount_cents, stripe_object_id, occurred_at, status")
      .gte("occurred_at", sinceIso);

    const bySubscription = new Map<string, any>();
    const byCustomer = new Map<string, any>();
    for (const m of memberships ?? []) {
      if (m.stripe_subscription_id) bySubscription.set(m.stripe_subscription_id, m);
      if (m.stripe_customer_id && !byCustomer.has(m.stripe_customer_id)) {
        byCustomer.set(m.stripe_customer_id, m);
      }
    }
    const membershipIds = new Set((memberships ?? []).map((m) => m.id as string));
    const swimmerOf = (m: any) =>
      m ? `${m.child_first_name ?? ""} ${m.child_last_name ?? ""}`.trim() || null : null;

    // ---- Stripe charges for the window ----
    const charges: any[] = [];
    let startingAfter: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res: any = await stripe.charges.list({
        created: { gte: since },
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      charges.push(...res.data);
      if (!res.has_more || res.data.length === 0) break;
      startingAfter = res.data[res.data.length - 1].id;
    }

    const chargeSubscriptionIds = new Set<string>();
    const succeededByCustomer = new Map<string, any[]>();

    const inStripeNotOurs: Row[] = [];
    const contradictions: Row[] = [];

    for (const c of charges) {
      const md = c.metadata ?? {};
      const customerId: string | null =
        typeof c.customer === "string" ? c.customer : c.customer?.id ?? null;
      const invoiceSub: string | null =
        c.invoice && typeof c.invoice === "object" ? c.invoice.subscription ?? null : null;
      const membership =
        (md.membership_id && membershipIds.has(md.membership_id)
          ? (memberships ?? []).find((m) => m.id === md.membership_id)
          : null) ??
        (invoiceSub ? bySubscription.get(invoiceSub) : null) ??
        (customerId ? byCustomer.get(customerId) : null) ??
        null;

      if (invoiceSub) chargeSubscriptionIds.add(invoiceSub);
      if (c.status === "succeeded" && customerId) {
        const arr = succeededByCustomer.get(customerId) ?? [];
        arr.push(c);
        succeededByCustomer.set(customerId, arr);
      }

      // (a) succeeded in Stripe but nothing here matches
      if (c.status === "succeeded" && !membership) {
        const noMetadata = Object.keys(md).length === 0;
        inStripeNotOurs.push({
          kind: "orphan_charge",
          stripeId: c.id,
          stripeUrl: stripeUrl(env, "payments", c.payment_intent ?? c.id),
          membershipId: null,
          swimmer: md.child_name ?? null,
          parentEmail: c.billing_details?.email ?? c.receipt_email ?? null,
          amountCents: c.amount ?? null,
          occurredAt: new Date((c.created ?? 0) * 1000).toISOString(),
          detail: noMetadata
            ? "Succeeded charge with no metadata. Likely a dashboard charge or prepayment."
            : "Succeeded charge whose metadata matches no membership record.",
        });
        continue;
      }

      // (c) money reversed in Stripe while the membership still looks paid.
      // A refund on an already-cancelled membership is expected, not drift.
      const stillBilling =
        membership && ["active", "pending_cancel", "paused"].includes(membership.status);
      if (stillBilling && (c.refunded || (c.amount_refunded ?? 0) > 0)) {
        contradictions.push({
          kind: "refunded_but_active",
          stripeId: c.id,
          stripeUrl: stripeUrl(env, "payments", c.payment_intent ?? c.id),
          membershipId: membership.id,
          swimmer: swimmerOf(membership),
          parentEmail: membership.parent_email,
          amountCents: c.amount_refunded ?? c.amount ?? null,
          occurredAt: new Date((c.created ?? 0) * 1000).toISOString(),
          detail: `Charge refunded in Stripe while membership status is "${membership.status}".`,
        });
      }
      if (membership && c.disputed === true) {
        contradictions.push({
          kind: "disputed_charge",
          stripeId: c.id,
          stripeUrl: stripeUrl(env, "payments", c.payment_intent ?? c.id),
          membershipId: membership.id,
          swimmer: swimmerOf(membership),
          parentEmail: membership.parent_email,
          amountCents: c.amount ?? null,
          occurredAt: new Date((c.created ?? 0) * 1000).toISOString(),
          detail: `Charge is disputed in Stripe while membership status is "${membership.status}".`,
        });
      }
    }

    // Ledger-recorded refunds/disputes that the charge list may not surface.
    for (const e of ledger ?? []) {
      if (!e.membership_id) continue;
      if (e.event_type !== "charge.refunded" && !`${e.event_type}`.startsWith("charge.dispute")) continue;
      const m = (memberships ?? []).find((x) => x.id === e.membership_id);
      if (!m || (m.status !== "active" && m.status !== "paused")) continue;
      const already = contradictions.some((r) => r.stripeId === e.stripe_object_id);
      if (already) continue;
      contradictions.push({
        kind: e.event_type === "charge.refunded" ? "refunded_but_active" : "disputed_charge",
        stripeId: e.stripe_object_id,
        stripeUrl: e.stripe_object_id ? stripeUrl(env, "payments", e.stripe_object_id) : null,
        membershipId: m.id,
        swimmer: swimmerOf(m),
        parentEmail: m.parent_email,
        amountCents: e.amount_cents,
        occurredAt: e.occurred_at,
        detail: `Stripe recorded ${e.event_type} while membership status is "${m.status}".`,
      });
    }

    // ---- (b) our records with no matching money in Stripe ----
    const ourRecordsNotInStripe: Row[] = [];
    const windowStart = new Date(Date.now() - DAYS * 86400 * 1000);

    for (const m of memberships ?? []) {
      const active = m.status === "active" || m.status === "pending_cancel" || m.status === "paused";
      if (!active) continue;

      if (!m.stripe_subscription_id) {
        ourRecordsNotInStripe.push({
          kind: "no_subscription",
          stripeId: null,
          stripeUrl: null,
          membershipId: m.id,
          swimmer: swimmerOf(m),
          parentEmail: m.parent_email,
          amountCents: m.recurring_consent_amount_cents ?? null,
          occurredAt: m.created_at,
          detail: `Membership is "${m.status}" but carries no Stripe subscription.`,
        });
        continue;
      }

      let sub: any = null;
      try {
        sub = await stripe.subscriptions.retrieve(m.stripe_subscription_id);
      } catch (_e) {
        ourRecordsNotInStripe.push({
          kind: "subscription_missing",
          stripeId: m.stripe_subscription_id,
          stripeUrl: stripeUrl(env, "subscriptions", m.stripe_subscription_id),
          membershipId: m.id,
          swimmer: swimmerOf(m),
          parentEmail: m.parent_email,
          amountCents: m.recurring_consent_amount_cents ?? null,
          occurredAt: m.created_at,
          detail: "Subscription id on the membership does not resolve in Stripe for this environment.",
        });
        continue;
      }

      const badStatuses = ["canceled", "unpaid", "incomplete", "incomplete_expired", "past_due"];
      if (badStatuses.includes(sub.status)) {
        contradictions.push({
          kind: "status_mismatch",
          stripeId: sub.id,
          stripeUrl: stripeUrl(env, "subscriptions", sub.id),
          membershipId: m.id,
          swimmer: swimmerOf(m),
          parentEmail: m.parent_email,
          amountCents: m.recurring_consent_amount_cents ?? null,
          occurredAt: m.created_at,
          detail: `Membership is "${m.status}" here but the Stripe subscription is "${sub.status}".`,
        });
      }

      // A membership that started before the window and is billing should have
      // at least one succeeded charge inside it.
      const startedBeforeWindow = m.start_date && new Date(m.start_date) < windowStart;
      const trialing = sub.status === "trialing";
      const hasCharge =
        chargeSubscriptionIds.has(sub.id) ||
        (m.stripe_customer_id && (succeededByCustomer.get(m.stripe_customer_id)?.length ?? 0) > 0);
      if (startedBeforeWindow && !trialing && !hasCharge) {
        ourRecordsNotInStripe.push({
          kind: "no_charge_in_window",
          stripeId: sub.id,
          stripeUrl: stripeUrl(env, "subscriptions", sub.id),
          membershipId: m.id,
          swimmer: swimmerOf(m),
          parentEmail: m.parent_email,
          amountCents: m.recurring_consent_amount_cents ?? null,
          occurredAt: m.current_period_start ?? m.created_at,
          detail: `Membership is "${m.status}" but no succeeded charge exists in the trailing ${DAYS} days.`,
        });
      }
    }

    // Cancelled here but still billing in Stripe.
    for (const m of memberships ?? []) {
      if (m.status !== "cancelled" || !m.stripe_subscription_id) continue;
      try {
        const sub: any = await stripe.subscriptions.retrieve(m.stripe_subscription_id);
        if (["active", "trialing", "past_due"].includes(sub.status)) {
          contradictions.push({
            kind: "status_mismatch",
            stripeId: sub.id,
            stripeUrl: stripeUrl(env, "subscriptions", sub.id),
            membershipId: m.id,
            swimmer: swimmerOf(m),
            parentEmail: m.parent_email,
            amountCents: m.recurring_consent_amount_cents ?? null,
            occurredAt: m.created_at,
            detail: `Membership is cancelled here but the Stripe subscription is still "${sub.status}".`,
          });
        }
      } catch (_e) {
        // Missing subscription on a cancelled membership is not drift.
      }
    }

    const byDate = (a: Row, b: Row) => `${b.occurredAt ?? ""}`.localeCompare(`${a.occurredAt ?? ""}`);

    return json({
      environment: env,
      windowDays: DAYS,
      generatedAt: new Date().toISOString(),
      chargesScanned: charges.length,
      membershipsScanned: (memberships ?? []).length,
      inStripeNotOurs: inStripeNotOurs.sort(byDate),
      ourRecordsNotInStripe: ourRecordsNotInStripe.sort(byDate),
      contradictions: contradictions.sort(byDate),
    }, 200);
  } catch (e) {
    console.error("[reconcile-membership-payments] failed", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
