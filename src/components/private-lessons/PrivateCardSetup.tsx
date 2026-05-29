import { useCallback, useEffect, useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { releaseHolds } from "@/lib/privateBooking";

interface Props {
  setupClientSecret: string;
  bookingId: string;
  checkoutSessionId: string;
  sessionToken: string;
  onComplete: () => void;
  onBack: () => void;
}

export default function PrivateCardSetup({
  setupClientSecret,
  bookingId,
  checkoutSessionId,
  sessionToken,
  onComplete,
  onBack,
}: Props) {
  const [stripeReady, setStripeReady] = useState<any>(null);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    getStripe().then(setStripeReady);
  }, []);

  const handleComplete = useCallback(async () => {
    if (finalizing) return;
    setFinalizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("confirm-private-booking", {
        body: {
          environment: getStripeEnvironment(),
          booking_id: bookingId,
          checkout_session_id: checkoutSessionId,
          session_token: sessionToken,
        },
      });
      if (error || !data?.success) {
        throw new Error(error?.message || (data as any)?.error || "Could not finalize booking");
      }
      onComplete();
    } catch (e: any) {
      toast({
        title: "Booking failed",
        description: e?.message || "Try again",
        variant: "destructive",
      });
      setFinalizing(false);
    }
  }, [bookingId, checkoutSessionId, sessionToken, onComplete, finalizing]);

  const fetchClientSecret = useCallback(
    () => Promise.resolve(setupClientSecret),
    [setupClientSecret],
  );

  const options = {
    fetchClientSecret,
    onComplete: handleComplete,
  };

  if (!stripeReady) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <h3 className="font-display text-2xl font-bold text-foreground mb-2">Save a card on file</h3>
      <p className="text-muted-foreground text-sm mb-1">
        No charge today. We'll charge $65 on the day of each lesson.
      </p>
      <p className="text-xs text-muted-foreground mb-6">
        Cancel up to 24 hours before any lesson at no charge. No-shows and late cancellations are charged in full.
      </p>

      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <EmbeddedCheckoutProvider stripe={stripeReady} options={options}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>

      {finalizing && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Finalizing your booking…
        </div>
      )}

      <Button
        variant="ghost"
        className="mt-4"
        disabled={finalizing}
        onClick={async () => {
          await releaseHolds(sessionToken);
          onBack();
        }}
      >
        <ChevronLeft className="w-4 h-4 mr-1" /> Back
      </Button>
    </div>
  );
}
