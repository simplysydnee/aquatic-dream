// Shared helper: find a reusable Stripe PaymentMethod for a parent
// across all of their lesson_bookings rows. Used by:
//   - lookup-parent-card-on-file (admin probe)
//   - admin-setup-card-for-booking (admin in-person reuse)
//   - create-private-booking-setup / confirm-private-booking-reuse (self-serve)
//
// "Reusable" = PM exists in Stripe, is type=card, still attached to the
// customer recorded on the same lesson_bookings row, and not past its
// expiry month.
import type Stripe from "https://esm.sh/stripe@18.5.0";

export interface ReusableCard {
  found: true;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
  source_booking_id: string;
  source_child_name: string | null;
  source_instructor_name: string | null;
}

export interface NoReusableCard {
  found: false;
  reason: "no_prior_pm" | "all_candidates_invalid";
}

export type ReusableCardResult = ReusableCard | NoReusableCard;


function isExpired(month: number, year: number): boolean {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  if (year < y) return true;
  if (year === y && month < m) return true;
  return false;
}

// Fallback: ask Stripe directly for a saved card. Used when none of the
// parent's own booking rows carry a usable PaymentMethod (e.g. the card was
// collected through a hosted setup link that never wrote back to our rows).
async function findCardInStripe(
  stripe: Stripe,
  email: string,
  knownCustomerIds: string[],
): Promise<ReusableCardResult> {
  const customerIds: string[] = [];
  for (const id of knownCustomerIds) {
    if (id && !customerIds.includes(id)) customerIds.push(id);
  }
  try {
    const byEmail = await stripe.customers.list({ email, limit: 10 });
    for (const c of byEmail.data) {
      if (!customerIds.includes(c.id)) customerIds.push(c.id);
    }
  } catch (e) {
    console.warn("card-on-file: stripe customer lookup failed", e instanceof Error ? e.message : String(e));
  }

  if (customerIds.length === 0) return { found: false, reason: "no_prior_pm" };

  for (const customerId of customerIds) {
    try {
      const pms = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 20 });
      const usable = pms.data
        .filter((pm) => pm.card && !isExpired(pm.card.exp_month, pm.card.exp_year))
        .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0];
      if (!usable?.card) continue;
      return {
        found: true,
        brand: usable.card.brand,
        last4: usable.card.last4,
        exp_month: usable.card.exp_month,
        exp_year: usable.card.exp_year,
        stripe_customer_id: customerId,
        stripe_payment_method_id: usable.id,
        source_booking_id: "",
        source_child_name: null,
        source_instructor_name: null,
      };
    } catch (e) {
      console.warn("card-on-file: stripe pm list failed", customerId, e instanceof Error ? e.message : String(e));
      continue;
    }
  }

  return { found: false, reason: "all_candidates_invalid" };
}

export async function findReusableCardForEmail(
  supabaseAdmin: any,
  stripe: Stripe,
  parentEmail: string,
): Promise<ReusableCardResult> {
  const email = parentEmail.toLowerCase().trim();

  const { data: rows, error } = await supabaseAdmin
    .from("lesson_bookings")
    .select(
      "id, stripe_customer_id, stripe_payment_method_id, child_name, instructor_name, updated_at",
    )
    .ilike("parent_email", email)
    .not("stripe_customer_id", "is", null)
    .not("stripe_payment_method_id", "is", null)
    .neq("status", "cancelled")
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) throw error;

  const candidates = ((rows as any[]) || []) as Array<{
    id: string;
    stripe_customer_id: string;
    stripe_payment_method_id: string;
    child_name: string | null;
    instructor_name: string | null;
    updated_at: string;
  }>;

  // Any Stripe customer ids we already know for this parent, even on rows
  // that never got a PaymentMethod stamped.
  const { data: custRows } = await supabaseAdmin
    .from("lesson_bookings")
    .select("stripe_customer_id, updated_at")
    .ilike("parent_email", email)
    .not("stripe_customer_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(20);
  const knownCustomerIds = (((custRows as any[]) || []) as Array<{ stripe_customer_id: string }>)
    .map((r) => r.stripe_customer_id)
    .filter(Boolean);

  const seen = new Set<string>();
  const ordered = candidates.filter((c) => {
    if (seen.has(c.stripe_payment_method_id)) return false;
    seen.add(c.stripe_payment_method_id);
    return true;
  });

  for (const c of ordered) {
    try {
      const pm = await stripe.paymentMethods.retrieve(c.stripe_payment_method_id);
      if (pm.type !== "card" || !pm.card) continue;
      const pmCustomer = typeof pm.customer === "string" ? pm.customer : pm.customer?.id ?? null;
      if (!pmCustomer || pmCustomer !== c.stripe_customer_id) continue;
      if (isExpired(pm.card.exp_month, pm.card.exp_year)) continue;

      return {
        found: true,
        brand: pm.card.brand,
        last4: pm.card.last4,
        exp_month: pm.card.exp_month,
        exp_year: pm.card.exp_year,
        stripe_customer_id: c.stripe_customer_id,
        stripe_payment_method_id: c.stripe_payment_method_id,
        source_booking_id: c.id,
        source_child_name: c.child_name,
        source_instructor_name: c.instructor_name,
      };
    } catch (e) {
      console.warn(
        "card-on-file: candidate skipped",
        c.stripe_payment_method_id,
        e instanceof Error ? e.message : String(e),
      );
      continue;
    }
  }

  return await findCardInStripe(stripe, email, knownCustomerIds);
}

