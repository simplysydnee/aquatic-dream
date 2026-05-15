import { useCallback } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  enrollmentId: string;
  amountCents: number;
  label?: string;
}

/**
 * Embedded Stripe checkout for admin to type the parent's card while on the
 * phone. Webhook (metadata.type='admin_phone_checkout') flips the enrollment
 * to paid; this component just renders the form and Stripe-hosted return.
 */
export default function PhoneCheckoutPanel({ enrollmentId, amountCents, label }: Props) {
  const fetchClientSecret = useCallback(async (): Promise<string> => {
    const { data, error } = await supabase.functions.invoke("create-admin-phone-checkout", {
      body: {
        enrollmentId,
        amountCents,
        label,
        environment: getStripeEnvironment(),
        returnUrl: `${window.location.origin}/admin`,
      },
    });
    if (error || !data?.clientSecret) {
      throw new Error(error?.message || "Failed to start checkout");
    }
    return data.clientSecret as string;
  }, [enrollmentId, amountCents, label]);

  return (
    <div id="phone-checkout" key={enrollmentId}>
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
