// Membership checkout is pinned to Stripe SANDBOX (test mode) until the
// deliberate go-live step. This lets us verify /join end-to-end with the
// 4242 test card without touching real money, even in production builds.
//
// Do NOT switch this to the live publishable key without also flipping
// create-membership-checkout off its sandbox pin. See
// aquatic-dreams-GOLIVE-checklist.md.
import { loadStripe, Stripe } from "@stripe/stripe-js";

const MEMBERSHIP_TEST_TOKEN =
  (import.meta.env.VITE_MEMBERSHIP_TEST_TOKEN as string | undefined) ||
  "pk_test_51TLnBXKA8zyjuHUA4CQmgiqFaiUo9WQYU2AUTqZcGoskKK6poENz94nAsFSJEUGRt9DSVb6MNZdkF9TZsdtcztOv00JF2jtLv3";

if (!MEMBERSHIP_TEST_TOKEN.startsWith("pk_test_")) {
  throw new Error("Membership checkout requires a Stripe TEST publishable key (pk_test_...)");
}

let stripePromise: Promise<Stripe | null> | null = null;

export function getMembershipStripe(): Promise<Stripe | null> {
  if (!stripePromise) stripePromise = loadStripe(MEMBERSHIP_TEST_TOKEN);
  return stripePromise;
}

export function getMembershipStripeEnvironment(): "sandbox" {
  return "sandbox";
}
