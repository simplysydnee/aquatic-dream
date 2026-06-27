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

  if (candidates.length === 0) return { found: false, reason: "no_prior_pm" };

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

  return { found: false, reason: "all_candidates_invalid" };
}
