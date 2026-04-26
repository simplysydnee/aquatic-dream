import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { useCallback } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occurrenceId: string | null;
  title?: string;
}

export default function LessonOccurrenceCheckoutDialog({ open, onOpenChange, occurrenceId, title }: Props) {
  const fetchClientSecret = useCallback(async (): Promise<string> => {
    if (!occurrenceId) throw new Error("No occurrence selected");
    const { data, error } = await supabase.functions.invoke("create-lesson-occurrence-checkout", {
      body: {
        occurrenceId,
        environment: getStripeEnvironment(),
        returnUrl: `${window.location.origin}/admin`,
      },
    });
    if (error || !data?.clientSecret) {
      throw new Error(error?.message || "Failed to start checkout");
    }
    return data.clientSecret as string;
  }, [occurrenceId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title || "Charge card in person"}</DialogTitle>
        </DialogHeader>
        {open && occurrenceId && (
          <div id="checkout" key={occurrenceId}>
            <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
