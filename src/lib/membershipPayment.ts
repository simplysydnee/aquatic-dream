// Display helpers for membership recurring-payment state. These read the
// additive payment columns on `memberships` written by the payments webhook.
// Payment state is deliberately separate from enrollment status: a failed
// charge never changes whether a swimmer is on the deck.

export interface MembershipPaymentState {
  last_invoice_id: string | null;
  last_payment_status: string | null;
  last_payment_at: string | null;
  last_payment_amount_cents: number | null;
  payment_failure_count: number | null;
  payment_failure_reason: string | null;
  stripe_subscription_status: string | null;
}

export type PaymentBucket = "paid" | "failed" | "awaiting";

const PROBLEM_SUBSCRIPTION_STATUSES = ["past_due", "unpaid", "canceled", "incomplete_expired"];

export const paymentBucket = (m: MembershipPaymentState): PaymentBucket => {
  if (m.last_payment_status === "failed") return "failed";
  if (m.last_payment_status === "paid") return "paid";
  return "awaiting";
};

export const hasPaymentProblem = (m: MembershipPaymentState & { status?: string }): boolean => {
  if (m.last_payment_status === "failed") return true;
  const subStatus = m.stripe_subscription_status;
  if (!subStatus) return false;
  const enrollmentActive = m.status ? ["active", "pending_cancel", "paused"].includes(m.status) : true;
  return enrollmentActive && PROBLEM_SUBSCRIPTION_STATUSES.includes(subStatus);
};

export const paymentDateLabel = (iso: string | null): string => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const paymentAmountLabel = (cents: number | null): string =>
  typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : "--";

export const paymentLabel = (m: MembershipPaymentState): string => {
  const bucket = paymentBucket(m);
  if (bucket === "awaiting") return "Awaiting first charge";
  const when = paymentDateLabel(m.last_payment_at);
  return bucket === "paid" ? `Paid ${when}` : `Failed ${when}`;
};

// Stripe decline codes and messages, restated in language a front-desk
// person can read out loud. Falls back to Stripe's own message.
const DECLINE_PHRASES: Array<[RegExp, string]> = [
  [/insufficient[_ ]funds/i, "The card did not have enough funds."],
  [/expired[_ ]card/i, "The card has expired."],
  [/incorrect[_ ]cvc|cvc[_ ]check/i, "The security code on the card was wrong."],
  [/lost[_ ]card|stolen[_ ]card/i, "The bank reported the card as lost or stolen."],
  [/card[_ ]velocity[_ ]exceeded/i, "The card hit its usage limit at the bank."],
  [/do[_ ]not[_ ]honor|generic[_ ]decline|card[_ ]declined/i, "The bank declined the charge without giving a reason."],
  [/authentication[_ ]required/i, "The bank needs the parent to approve the charge."],
  [/processing[_ ]error/i, "The card network had a temporary error."],
];

export const plainDeclineReason = (reason: string | null): string => {
  if (!reason) return "The bank declined the charge. No reason was given.";
  for (const [pattern, phrase] of DECLINE_PHRASES) {
    if (pattern.test(reason)) return phrase;
  }
  return reason;
};
