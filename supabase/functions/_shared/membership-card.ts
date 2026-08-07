// Shared: put a new card on a membership's Stripe subscription and retry the
// open invoice with it.
//
// Used by:
//   - membership-attach-card-and-retry (admin dialog: front-desk card or the
//     returned checkout session)
//   - payments-webhook (parent finished the emailed/texted card update link)
//
// This NEVER changes membership status. It only moves money and writes the
// display-only payment columns admin already reads.
import type Stripe from "https://esm.sh/stripe@18.5.0";

export type RetryOutcome = "paid" | "no_open_invoice" | "declined" | "no_subscription";

export interface AttachCardResult {
  outcome: RetryOutcome;
  message: string;
  brand?: string;
  last4?: string;
  declineCode?: string | null;
  invoiceId?: string | null;
  amountCents?: number | null;
}

interface MembershipRow {
  id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

/** Pull the PaymentMethod id out of a completed setup-mode checkout session. */
export async function paymentMethodFromSetupSession(
  stripe: Stripe,
  sessionId: string,
): Promise<{ paymentMethodId: string | null; customerId: string | null }> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const setupIntentId = typeof session.setup_intent === "string"
    ? session.setup_intent
    : session.setup_intent?.id ?? null;
  if (!setupIntentId) return { paymentMethodId: null, customerId };
  const si = await stripe.setupIntents.retrieve(setupIntentId);
  const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id ?? null;
  return { paymentMethodId: pm, customerId };
}

export async function paymentMethodFromSetupIntent(
  stripe: Stripe,
  setupIntentId: string,
): Promise<{ paymentMethodId: string | null; customerId: string | null }> {
  const si = await stripe.setupIntents.retrieve(setupIntentId);
  const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id ?? null;
  const customerId = typeof si.customer === "string" ? si.customer : si.customer?.id ?? null;
  return { paymentMethodId: pm, customerId };
}

export async function attachCardAndRetry(
  supabase: any,
  stripe: Stripe,
  membership: MembershipRow,
  paymentMethodId: string,
  fallbackCustomerId?: string | null,
): Promise<AttachCardResult> {
  const customerId = membership.stripe_customer_id || fallbackCustomerId || null;
  if (!customerId) {
    return { outcome: "no_subscription", message: "This membership has no Stripe customer on file." };
  }

  // Attach (already-attached cards throw a benign error we can ignore).
  try {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already been attached/i.test(msg)) throw e;
  }

  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  const brand = pm.card?.brand ?? "card";
  const last4 = pm.card?.last4 ?? "";

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  const nowIso = new Date().toISOString();
  await supabase
    .from("memberships")
    .update({ stripe_customer_id: customerId, card_updated_at: nowIso })
    .eq("id", membership.id);

  const subscriptionId = membership.stripe_subscription_id;
  if (!subscriptionId) {
    return {
      outcome: "no_subscription",
      message: `Card ending ${last4} is saved, but this membership has no active subscription to charge.`,
      brand,
      last4,
    };
  }

  await stripe.subscriptions.update(subscriptionId, { default_payment_method: paymentMethodId });

  // Newest unpaid invoice on this subscription.
  const open = await stripe.invoices.list({ subscription: subscriptionId, status: "open", limit: 1 });
  const invoice = open.data[0];
  if (!invoice?.id) {
    return {
      outcome: "no_open_invoice",
      message: `Card ending ${last4} is saved and set as the default. There is no unpaid invoice right now, so Stripe will use this card on the next charge.`,
      brand,
      last4,
    };
  }

  try {
    const paid = await stripe.invoices.pay(invoice.id, { payment_method: paymentMethodId });
    await supabase
      .from("memberships")
      .update({
        last_invoice_id: paid.id,
        last_payment_status: "paid",
        last_payment_at: nowIso,
        last_payment_amount_cents: paid.amount_paid ?? paid.amount_due ?? null,
        payment_failure_count: 0,
        payment_failure_reason: null,
      })
      .eq("id", membership.id);

    return {
      outcome: "paid",
      message: `Charged ${formatAmount(paid.amount_paid ?? paid.amount_due)} to the ${brand} ending ${last4}.`,
      brand,
      last4,
      invoiceId: paid.id,
      amountCents: paid.amount_paid ?? paid.amount_due ?? null,
    };
  } catch (e) {
    const err = e as { message?: string; decline_code?: string; code?: string };
    const declineCode = err?.decline_code ?? err?.code ?? null;
    const reason = err?.message ?? "The bank declined the charge.";
    await supabase
      .from("memberships")
      .update({
        last_invoice_id: invoice.id,
        last_payment_status: "failed",
        last_payment_at: nowIso,
        last_payment_amount_cents: invoice.amount_due ?? null,
        payment_failure_reason: reason,
      })
      .eq("id", membership.id);

    return {
      outcome: "declined",
      message: `The ${brand} ending ${last4} was declined. ${reason}`,
      brand,
      last4,
      declineCode,
      invoiceId: invoice.id,
    };
  }
}

function formatAmount(cents: number | null | undefined): string {
  return typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : "the balance";
}
