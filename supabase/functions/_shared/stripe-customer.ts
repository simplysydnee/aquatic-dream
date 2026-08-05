// One Stripe customer per parent email.
//
// Before this helper, each membership checkout did its own
// `customers.list({ email, limit: 1 })`, which is order-dependent: a family
// that already had two customer records could land on the one WITHOUT the
// saved card, and a family enrolling a second swimmer could end up on a
// different record than their first. Both make "use your card ending in
// NNNN" impossible.
//
// resolveParentStripeCustomer picks a single canonical customer for an email
// (preferring the one that already has a default payment method, then the
// oldest), backfills name/phone, and reports the saved card if there is one.
import type Stripe from "https://esm.sh/stripe@18.5.0";

export interface SavedCard {
  paymentMethodId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface ResolvedParentCustomer {
  customerId: string;
  created: boolean;
  duplicateCustomerIds: string[];
  savedCard: SavedCard | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function cardIsExpired(month: number, year: number): boolean {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return year < y || (year === y && month < m);
}

async function listCustomersByEmail(stripe: Stripe, email: string) {
  const seen = new Map<string, Stripe.Customer>();
  const res = await stripe.customers.list({ email, limit: 100 });
  for (const c of res.data) {
    if (!c.deleted) seen.set(c.id, c as Stripe.Customer);
  }
  return [...seen.values()];
}

/** Newest usable card on the customer, default payment method first. */
export async function findSavedCardForCustomer(
  stripe: Stripe,
  customer: Stripe.Customer,
): Promise<SavedCard | null> {
  const defaultPm = customer.invoice_settings?.default_payment_method;
  const defaultPmId = typeof defaultPm === "string" ? defaultPm : defaultPm?.id ?? null;

  let pms: Stripe.PaymentMethod[] = [];
  try {
    const list = await stripe.paymentMethods.list({
      customer: customer.id,
      type: "card",
      limit: 20,
    });
    pms = list.data;
  } catch (e) {
    console.warn(
      "[stripe-customer] payment method list failed",
      customer.id,
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }

  const usable = pms.filter((pm) => pm.card && !cardIsExpired(pm.card.exp_month, pm.card.exp_year));
  if (usable.length === 0) return null;

  const chosen =
    usable.find((pm) => pm.id === defaultPmId) ??
    usable.sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0];
  if (!chosen?.card) return null;

  return {
    paymentMethodId: chosen.id,
    brand: chosen.card.brand,
    last4: chosen.card.last4,
    expMonth: chosen.card.exp_month,
    expYear: chosen.card.exp_year,
  };
}

export async function resolveParentStripeCustomer(
  stripe: Stripe,
  parent: { email: string; name?: string | null; phone?: string | null },
): Promise<ResolvedParentCustomer> {
  const email = normalizeEmail(parent.email);
  const candidates = await listCustomersByEmail(stripe, email);

  if (candidates.length === 0) {
    const created = await stripe.customers.create({
      email,
      name: parent.name || undefined,
      phone: parent.phone || undefined,
      metadata: { parent_email: email },
    });
    return { customerId: created.id, created: true, duplicateCustomerIds: [], savedCard: null };
  }

  // Canonical pick: a customer that already has a default payment method
  // wins, so repeat enrollments keep charging the card the family knows
  // about. Ties break on the oldest record, which is stable over time.
  const withDefault = candidates.filter((c) => !!c.invoice_settings?.default_payment_method);
  const pool = withDefault.length > 0 ? withDefault : candidates;
  const canonical = pool.sort((a, b) => (a.created ?? 0) - (b.created ?? 0))[0];

  const duplicateCustomerIds = candidates.map((c) => c.id).filter((id) => id !== canonical.id);
  if (duplicateCustomerIds.length > 0) {
    console.log("[stripe-customer] duplicate customers for email", { email, canonical: canonical.id, duplicateCustomerIds });
  }

  // Backfill only missing fields; never overwrite what the family or the
  // Stripe dashboard already holds.
  const patch: Stripe.CustomerUpdateParams = {};
  if (!canonical.name && parent.name) patch.name = parent.name;
  if (!canonical.phone && parent.phone) patch.phone = parent.phone;
  if (!canonical.metadata?.parent_email) patch.metadata = { ...(canonical.metadata ?? {}), parent_email: email };
  if (Object.keys(patch).length > 0) {
    try {
      await stripe.customers.update(canonical.id, patch);
    } catch (e) {
      console.warn("[stripe-customer] backfill failed", canonical.id, e instanceof Error ? e.message : String(e));
    }
  }

  const savedCard = await findSavedCardForCustomer(stripe, canonical);
  return { customerId: canonical.id, created: false, duplicateCustomerIds, savedCard };
}

/**
 * Validates a saved card is still usable and attached to the customer we are
 * about to bill. Returns null when the card has been removed or expired.
 */
export async function verifySavedCard(
  stripe: Stripe,
  customerId: string,
  paymentMethodId: string,
): Promise<SavedCard | null> {
  try {
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.type !== "card" || !pm.card) return null;
    const pmCustomer = typeof pm.customer === "string" ? pm.customer : pm.customer?.id ?? null;
    if (!pmCustomer || pmCustomer !== customerId) return null;
    if (cardIsExpired(pm.card.exp_month, pm.card.exp_year)) return null;
    return {
      paymentMethodId: pm.id,
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
    };
  } catch (e) {
    console.warn("[stripe-customer] saved card verify failed", paymentMethodId, e instanceof Error ? e.message : String(e));
    return null;
  }
}
