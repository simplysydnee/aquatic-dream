import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

interface EnrollmentCheckoutProps {
  priceIds: string[];
  customerEmail: string;
  enrollmentId: string;
  onBack: () => void;
}

export default function EnrollmentCheckout({
  priceIds,
  customerEmail,
  enrollmentId,
  onBack,
}: EnrollmentCheckoutProps) {
  const fetchClientSecret = async (): Promise<string> => {
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: {
        priceIds,
        customerEmail,
        enrollmentId,
        returnUrl: `${window.location.origin}/enroll?step=done&session_id={CHECKOUT_SESSION_ID}`,
        environment: getStripeEnvironment(),
      },
    });
    if (error || !data?.clientSecret) {
      throw new Error(error?.message || "Failed to create checkout session");
    }
    return data.clientSecret;
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h3 className="font-display text-2xl font-bold text-foreground mb-1">
        Complete Payment
      </h3>
      <p className="text-muted-foreground text-sm mb-6">
        Please complete your payment to finalize enrollment.
      </p>

      <div className="rounded-lg border border-border overflow-hidden">
        <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>

      <div className="mt-4">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ChevronLeft className="mr-1 w-4 h-4" /> Back
        </Button>
      </div>
    </div>
  );
}
