import { useCallback, useEffect, useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, CreditCard } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { releaseHolds } from "@/lib/privateBooking";

interface Props {
  setupClientSecret: string;
  bookingId: string;
  setupIntentId: string;
  sessionToken: string;
  onComplete: () => void;
  onBack: () => void;
}

function CardForm({ bookingId, setupIntentId, sessionToken, onComplete }: {
  bookingId: string; setupIntentId: string; sessionToken: string; onComplete: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    try {
      const { error } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });
      if (error) {
        toast({ title: "Card failed", description: error.message, variant: "destructive" });
        setSubmitting(false);
        return;
      }
      // Confirm booking on server
      const { data, error: cErr } = await supabase.functions.invoke("confirm-private-booking", {
        body: {
          environment: getStripeEnvironment(),
          booking_id: bookingId,
          setup_intent_id: setupIntentId,
          session_token: sessionToken,
        },
      });
      if (cErr || !data?.success) throw new Error(cErr?.message || "Could not finalize booking");
      onComplete();
    } catch (e: any) {
      toast({ title: "Booking failed", description: e?.message || "Try again", variant: "destructive" });
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button type="submit" className="w-full" disabled={!stripe || submitting}>
        {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving card…</> : <><CreditCard className="w-4 h-4 mr-2" />Save card & confirm booking</>}
      </Button>
    </form>
  );
}

export default function PrivateCardSetup({ setupClientSecret, bookingId, setupIntentId, sessionToken, onComplete, onBack }: Props) {
  const [stripeReady, setStripeReady] = useState<any>(null);

  useEffect(() => {
    getStripe().then(setStripeReady);
  }, []);

  if (!stripeReady) return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="max-w-lg mx-auto">
      <h3 className="font-display text-2xl font-bold text-foreground mb-2">Save a card on file</h3>
      <p className="text-muted-foreground text-sm mb-1">
        No charge today. We'll charge $65 to your card the day after each lesson.
      </p>
      <p className="text-xs text-muted-foreground mb-6">
        Cancel up to 24 hours before any lesson at no charge.
      </p>

      <div className="border border-border rounded-lg p-4 bg-card">
        <Elements stripe={stripeReady} options={{ clientSecret: setupClientSecret }}>
          <CardForm
            bookingId={bookingId}
            setupIntentId={setupIntentId}
            sessionToken={sessionToken}
            onComplete={onComplete}
          />
        </Elements>
      </div>

      <Button variant="ghost" className="mt-4" onClick={async () => { await releaseHolds(sessionToken); onBack(); }}>
        <ChevronLeft className="w-4 h-4 mr-1" /> Back
      </Button>
    </div>
  );
}
