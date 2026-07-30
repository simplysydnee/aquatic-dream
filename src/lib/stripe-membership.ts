// Membership checkout now follows the same environment as the rest of the
// app: derived from the VITE_PAYMENTS_CLIENT_TOKEN publishable-key prefix
// (pk_test_ = sandbox, pk_live_ = live). The server side
// (create-membership-checkout) uses the environment we send here, so the
// embedded checkout iframe and the Checkout Session always agree.
import { loadStripe, Stripe } from "@stripe/stripe-js";

type StripeEnv = "sandbox" | "live";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

function membershipEnvironment(): StripeEnv {
  if (clientToken?.startsWith("pk_test_")) return "sandbox";
  if (clientToken?.startsWith("pk_live_")) return "live";
  throw new Error(
    "Stripe payments are not configured for this build. " +
      "Complete Stripe go-live in your Lovable project to enable production checkout.",
  );
}

let stripePromise: Promise<Stripe | null> | null = null;

export function getMembershipStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    membershipEnvironment(); // throws on misconfig
    stripePromise = loadStripe(clientToken as string);
  }
  return stripePromise;
}

export function getMembershipStripeEnvironment(): StripeEnv {
  return membershipEnvironment();
}
