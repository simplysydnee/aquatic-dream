import { useCallback, useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { supabase } from "@/integrations/supabase/client";
import { getStripe } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Copy, CreditCard, Loader2, Send } from "lucide-react";
import { paymentAmountLabel, plainDeclineReason } from "@/lib/membershipPayment";

interface FixPaymentTarget {
  id: string;
  swimmerName: string;
  parentName: string;
  parentEmail: string | null;
  parentPhone: string | null;
  lastPaymentAmountCents: number | null;
  lastPaymentAt: string | null;
  paymentFailureReason: string | null;
  cardLinkSentAt: string | null;
  cardUpdatedAt: string | null;
}

interface Props {
  membership: FixPaymentTarget | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

const stamp = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

export const FixPaymentDialog = ({ membership, onOpenChange, onDone }: Props) => {
  const [mode, setMode] = useState<"choose" | "in_person">("choose");
  const [sending, setSending] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!membership) {
      setMode("choose");
      setLink(null);
      setClientSecret(null);
      setResult(null);
    }
  }, [membership]);

  const sendLink = useCallback(async () => {
    if (!membership) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("membership-card-update-link", {
      body: { membership_id: membership.id, channels: ["sms", "email"] },
    });
    setSending(false);
    const failure = error?.message || (data as { error?: string } | null)?.error;
    if (failure || !data?.url) {
      toast({ title: "Could not send the card link", description: failure ?? "Try again", variant: "destructive" });
      return;
    }
    setLink(data.url as string);
    const sent = (data.sent ?? {}) as { sms?: boolean; email?: boolean };
    toast({
      title: "Card link sent",
      description: [sent.sms ? "Text" : null, sent.email ? "Email" : null].filter(Boolean).join(" and ") ||
        "Copy the link below and read it to the parent.",
    });
    onDone();
  }, [membership, onDone]);

  const startInPerson = useCallback(async () => {
    if (!membership) return;
    setLoadingIntent(true);
    const { data, error } = await supabase.functions.invoke("membership-card-setup-intent", {
      body: { membership_id: membership.id },
    });
    setLoadingIntent(false);
    const failure = error?.message || (data as { error?: string } | null)?.error;
    if (failure || !data?.clientSecret) {
      toast({ title: "Could not open the card form", description: failure ?? "Try again", variant: "destructive" });
      return;
    }
    setClientSecret(data.clientSecret as string);
    setMode("in_person");
  }, [membership]);

  const stripePromise = useMemo(() => getStripe(), []);

  return (
    <Dialog open={!!membership} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {membership && (
          <>
            <DialogHeader>
              <DialogTitle>Fix payment for {membership.swimmerName}</DialogTitle>
              <DialogDescription>
                {plainDeclineReason(membership.paymentFailureReason)}{" "}
                {membership.lastPaymentAmountCents
                  ? `${paymentAmountLabel(membership.lastPaymentAmountCents)} is unpaid.`
                  : ""}
              </DialogDescription>
            </DialogHeader>

            {result ? (
              <div className="space-y-4 text-sm">
                <p>{result}</p>
                <Button className="w-full" onClick={() => onOpenChange(false)}>Done</Button>
              </div>
            ) : mode === "in_person" && clientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <InPersonCardForm
                  membershipId={membership.id}
                  onCancel={() => { setMode("choose"); setClientSecret(null); }}
                  onFinished={(message) => { setResult(message); onDone(); }}
                />
              </Elements>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="space-y-2 rounded border p-3">
                  <div className="font-medium">Text or email the parent a card update link</div>
                  <p className="text-muted-foreground text-xs">
                    Goes to {membership.parentPhone ?? "no phone on file"} and{" "}
                    {membership.parentEmail ?? "no email on file"}.
                  </p>
                  <Button size="sm" onClick={sendLink} disabled={sending}>
                    {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Send card update link
                  </Button>
                  {link && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        readOnly
                        value={link}
                        className="w-full truncate rounded border bg-muted px-2 py-1 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void navigator.clipboard.writeText(link);
                          toast({ title: "Link copied" });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded border p-3">
                  <div className="font-medium">Enter the card at the front desk</div>
                  <p className="text-muted-foreground text-xs">
                    Card details go straight to Stripe. We never see or store the number.
                  </p>
                  <Button size="sm" variant="outline" onClick={startInPerson} disabled={loadingIntent}>
                    {loadingIntent ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="mr-2 h-4 w-4" />
                    )}
                    Enter card now
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  {stamp(membership.cardLinkSentAt) ? `Link last sent ${stamp(membership.cardLinkSentAt)}. ` : ""}
                  {stamp(membership.cardUpdatedAt) ? `Card last updated ${stamp(membership.cardUpdatedAt)}. ` : ""}
                  The swimmer stays enrolled either way.
                </p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const InPersonCardForm = ({
  membershipId,
  onCancel,
  onFinished,
}: {
  membershipId: string;
  onCancel: () => void;
  onFinished: (message: string) => void;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    });
    if (error || !setupIntent?.id) {
      setBusy(false);
      toast({
        title: "Card was not saved",
        description: error?.message ?? "Check the card details and try again",
        variant: "destructive",
      });
      return;
    }

    const { data, error: fnError } = await supabase.functions.invoke("membership-attach-card-and-retry", {
      body: { membership_id: membershipId, setup_intent_id: setupIntent.id },
    });
    setBusy(false);
    const failure = fnError?.message || (data as { error?: string } | null)?.error;
    if (failure) {
      toast({ title: "Could not charge the new card", description: failure, variant: "destructive" });
      return;
    }
    onFinished((data as { message?: string })?.message ?? "Card saved.");
  };

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <div className="flex gap-2">
        <Button onClick={submit} disabled={busy || !stripe}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save card and charge
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Back</Button>
      </div>
    </div>
  );
};
