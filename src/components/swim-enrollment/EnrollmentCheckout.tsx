import { useState, useMemo, useCallback } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Mail, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";

// Set VITE_CHECKOUT_FALLBACK=1 to fall back to reserve-seat + emailed payment link.
const CHECKOUT_FALLBACK = import.meta.env.VITE_CHECKOUT_FALLBACK === "1";

interface EnrollmentCheckoutProps {
  /** Builds the checkout payload. Called once per "Continue to payment" click. */
  buildPayload: (opts: { payAheadForFirstTimers: boolean }) => unknown;
  customerEmail: string;
  hasFirstTimers: boolean;
  /** Per-session fee shown in the toggle copy (USD, no symbol). */
  sessionFeeUsd: number;
  /** Number of session-fee charges that pay-ahead would add. */
  sessionFeeCount: number;
  /**
   * When true, the session has already started for at least one first-timer.
   * The "pay session fee on day 1" option is unavailable — full payment due now.
   */
  forceFullPayment?: boolean;
  onBack: () => void;
  /** Called when the server reports a session is full (409). Skip throwing — show fallback. */
  onSessionFull?: () => void;
}

export default function EnrollmentCheckout({
  buildPayload,
  customerEmail,
  hasFirstTimers,
  sessionFeeUsd,
  sessionFeeCount,
  forceFullPayment = false,
  onBack,
  onSessionFull,
}: EnrollmentCheckoutProps) {
  // Default = pay reg fee only (current behavior). User can opt to pay ahead.
  // When forceFullPayment is set, we lock to "pay_ahead" and skip the toggle.
  const [payAhead, setPayAhead] = useState<"reg_only" | "pay_ahead">(
    forceFullPayment ? "pay_ahead" : "reg_only",
  );
  const [confirmed, setConfirmed] = useState(forceFullPayment);

  // The embedded checkout will mount with the payload at confirmation time.
  // Changing the toggle after confirming requires "Change" → re-mounts with new payload.
  const payload = useMemo(
    () => (confirmed || !hasFirstTimers ? buildPayload({ payAheadForFirstTimers: payAhead === "pay_ahead" }) : null),
    [confirmed, hasFirstTimers, payAhead, buildPayload],
  );

  const [lastError, setLastError] = useState<string | null>(null);

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    setLastError(null);
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: {
        payload,
        customerEmail,
        returnUrl: `${window.location.origin}/swim-enrollment?step=done&session_id={CHECKOUT_SESSION_ID}`,
        environment: getStripeEnvironment(),
      },
    });
    if (error || !data?.clientSecret) {
      const msg = String(error?.message || data?.error || "Failed to create checkout session");
      // eslint-disable-next-line no-console
      console.error("[checkout] fetchClientSecret failed", {
        message: msg,
        status: (error as { context?: { status?: number } } | null)?.context?.status,
        data,
        customerEmail,
      });
      if (/is full|sold out|capacity/i.test(msg) && onSessionFull) {
        onSessionFull();
        throw new Error("Session full — redirecting to waitlist");
      }
      setLastError(msg);
      throw new Error(msg);
    }
    return data.clientSecret;
  }, [customerEmail, payload, onSessionFull]);

  const sessionTotal = sessionFeeUsd * sessionFeeCount;

  // ---- FALLBACK PATH: reserve seat + email payment link ----
  const [reserving, setReserving] = useState(false);
  const [reserved, setReserved] = useState(false);

  const handleReserve = useCallback(async () => {
    setReserving(true);
    setLastError(null);
    try {
      const built = buildPayload({ payAheadForFirstTimers: false }) as unknown;
      const { data, error } = await supabase.functions.invoke("create-pending-enrollment", {
        body: { payload: built, environment: getStripeEnvironment() },
      });
      if (error || !data?.success) {
        const msg = String(error?.message || data?.error || "Failed to reserve seat");
        // eslint-disable-next-line no-console
        console.error("[checkout] reserve failed", {
          message: msg,
          status: (error as { context?: { status?: number } } | null)?.context?.status,
          data,
          customerEmail,
        });
        throw new Error(msg);
      }
      setReserved(true);
    } catch (e) {
      const msg = (e as Error).message;
      setLastError(msg);
      toast({
        title: "Could not reserve your seat",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setReserving(false);
    }
  }, [buildPayload, customerEmail]);

  if (CHECKOUT_FALLBACK && reserved) {
    return (
      <div className="max-w-2xl mx-auto px-0 sm:px-0">
        <h3 className="font-display text-2xl font-bold text-foreground mb-2">Seat reserved 🎉</h3>
        <p className="text-muted-foreground mb-4">
          We just emailed <strong>{customerEmail}</strong> a secure payment link to finish your enrollment.
          Your spot is held until you complete payment. Check your inbox (and spam folder).
        </p>
        <Button onClick={() => (window.location.href = "/")}>Done</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-0 sm:px-0">
      <h3 className="font-display text-2xl font-bold text-foreground mb-1">
        {CHECKOUT_FALLBACK ? "Reserve your seat" : "Complete Payment"}
      </h3>
      <p className="text-muted-foreground text-sm mb-6">
        {CHECKOUT_FALLBACK
          ? "Card payment in this window is temporarily unavailable. Reserve your seat now and we'll email you a secure Stripe payment link to complete enrollment."
          : "Please complete your payment to finalize enrollment. Your seat is reserved when payment succeeds."}
      </p>

      {CHECKOUT_FALLBACK && (
        <div className="rounded-lg border border-border p-5 mb-4 bg-muted/30">
          <p className="font-semibold text-foreground mb-2">What happens next</p>
          <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1 mb-4">
            <li>We reserve your seat in the requested class(es).</li>
            <li>You receive an email from Aquatic Dreams with a Stripe payment link.</li>
            <li>Pay {hasFirstTimers ? "the $45 registration fee" : `the $${sessionFeeUsd} session fee`} from the link to confirm.</li>
          </ol>
          <Button className="w-full" onClick={handleReserve} disabled={reserving}>
            {reserving ? (
              <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Reserving…</>
            ) : (
              <><Mail className="mr-2 w-4 h-4" /> Reserve seat — email me the payment link</>
            )}
          </Button>
        </div>
      )}


      {!CHECKOUT_FALLBACK && hasFirstTimers && !confirmed && (
        <div className="rounded-lg border border-border p-4 mb-4 bg-muted/30">
          <p className="font-semibold text-foreground mb-3">How would you like to pay the session fee?</p>
          <RadioGroup value={payAhead} onValueChange={(v) => setPayAhead(v as "reg_only" | "pay_ahead")}>
            <div className="flex items-start gap-3 mb-2">
              <RadioGroupItem value="reg_only" id="reg_only" className="mt-1" />
              <Label htmlFor="reg_only" className="cursor-pointer font-normal">
                <span className="font-semibold">Pay registration only ($45 today)</span>
                <p className="text-sm text-muted-foreground">
                  Pay the ${sessionFeeUsd} session fee in person on the first day of class.
                </p>
              </Label>
            </div>
            <div className="flex items-start gap-3">
              <RadioGroupItem value="pay_ahead" id="pay_ahead" className="mt-1" />
              <Label htmlFor="pay_ahead" className="cursor-pointer font-normal">
                <span className="font-semibold">
                  Pay registration + session fee (${(45 + sessionTotal).toFixed(0)} today)
                </span>
                <p className="text-sm text-muted-foreground">
                  Skip the day-1 payment. Everything settled now.
                </p>
              </Label>
            </div>
          </RadioGroup>
          <Button className="mt-4 w-full" onClick={() => setConfirmed(true)}>
            Continue to payment
          </Button>
        </div>
      )}

      {!CHECKOUT_FALLBACK && (!hasFirstTimers || confirmed) && (
        <>
          {hasFirstTimers && forceFullPayment && (
            <div className="mb-3 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-3">
              This session has already started — the full amount
              (<strong>${(45 + sessionTotal).toFixed(0)}</strong>: $45 registration + ${sessionTotal.toFixed(0)} prorated session fee)
              is due today.
            </div>
          )}
          {hasFirstTimers && !forceFullPayment && (
            <div className="flex items-center justify-between mb-3 text-sm">
              <span className="text-muted-foreground">
                {payAhead === "pay_ahead"
                  ? `Paying $${(45 + sessionTotal).toFixed(0)} now (registration + session fee).`
                  : `Paying $45 now (registration only). Session fee due day 1.`}
              </span>
              <Button type="button" variant="link" size="sm" onClick={() => setConfirmed(false)}>
                Change
              </Button>
            </div>
          {lastError && (
            <div className="mb-3 text-sm rounded-lg border border-red-300 bg-red-50 text-red-900 p-3">
              <p className="font-semibold mb-1">Checkout error</p>
              <p className="whitespace-pre-wrap break-words">{lastError}</p>
              <p className="text-xs mt-2 opacity-80">
                Please screenshot this message and send it to Aquatic Dreams so we can finish your enrollment.
              </p>
            </div>
          )}
          <div className="rounded-lg border border-border overflow-hidden min-w-0">
            <EmbeddedCheckoutProvider
              key={payAhead}
              stripe={getStripe()}
              options={{ fetchClientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        </>
      )}

      <div className="mt-4">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ChevronLeft className="mr-1 w-4 h-4" /> Back
        </Button>
      </div>
    </div>
  );
}
