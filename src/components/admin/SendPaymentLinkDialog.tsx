import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { getSessionRemainingLessons, type RemainingLessonsInfo } from "@/lib/sessionRemainingLessons";
import { toast } from "@/hooks/use-toast";

export interface SendPaymentLinkTarget {
  enrollmentId: string;
  sessionId: string | null;
  childName: string;
  parentEmail: string;
  isFirstTime: boolean;
  waiverSignedAt: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: SendPaymentLinkTarget | null;
  onSent?: () => void;
}

export default function SendPaymentLinkDialog({ open, onOpenChange, target, onSent }: Props) {
  const [info, setInfo] = useState<RemainingLessonsInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [includeWaiver, setIncludeWaiver] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !target) return;
    setInfo(null);
    setAmount("");
    setIncludeWaiver(!target.waiverSignedAt && target.isFirstTime);

    if (!target.sessionId) {
      setAmount("240");
      return;
    }
    setLoading(true);
    getSessionRemainingLessons(target.sessionId)
      .then((i) => {
        setInfo(i);
        setAmount(String(i.suggestedDollars));
      })
      .catch(() => setAmount("240"))
      .finally(() => setLoading(false));
  }, [open, target]);

  const handlePreset = (dollars: number) => setAmount(String(dollars));

  const handleSend = async () => {
    if (!target) return;
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars < 1) {
      toast({ title: "Invalid amount", description: "Enter $1 or more.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-session-payment-link", {
        body: {
          enrollmentId: target.enrollmentId,
          environment: getStripeEnvironment(),
          siteUrl: window.location.origin,
          amountOverrideCents: Math.round(dollars * 100),
          includeWaiverLink: includeWaiver,
        },
      });
      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || "Failed to send payment link");
      }
      toast({
        title: "Payment link sent",
        description: `$${dollars.toFixed(2)} link emailed to ${target.parentEmail}${includeWaiver ? " (with waiver)" : ""}`,
      });
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Send failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Session Payment Link</DialogTitle>
          <DialogDescription>
            {target ? <>For <strong>{target.childName}</strong> — {target.parentEmail}</> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Calculating remaining lessons…
            </p>
          ) : info ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p>
                <strong>{info.remaining}</strong> of {info.total} lessons remaining
                {info.isProrated && (
                  <> · prorated <strong>{info.remaining} × ${info.perLessonRate} = ${info.suggestedDollars}</strong></>
                )}
              </p>
              {!info.isProrated && (
                <p className="text-muted-foreground mt-1">Full session price applies.</p>
              )}
            </div>
          ) : null}

          <div>
            <Label className="text-xs">Amount to charge (USD)</Label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-muted-foreground">$</span>
              <Input
                type="number"
                min={1}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {info && info.isProrated && (
                <Button type="button" size="sm" variant="outline" onClick={() => handlePreset(info.suggestedDollars)}>
                  Prorated (${info.suggestedDollars})
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handlePreset(info?.fullSessionDollars ?? 240)}
              >
                Full (${info?.fullSessionDollars ?? 240})
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-md border bg-muted/20">
            <Checkbox
              id="include-waiver"
              checked={includeWaiver}
              onCheckedChange={(v) => setIncludeWaiver(v === true)}
              className="mt-0.5"
              disabled={!!target?.waiverSignedAt}
            />
            <div>
              <Label htmlFor="include-waiver" className="text-sm cursor-pointer">
                Include waiver signing link in the email
              </Label>
              {target?.waiverSignedAt ? (
                <p className="text-xs text-muted-foreground mt-0.5">Waiver already signed.</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Adds a "Sign waiver" link alongside the payment button.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || loading}>
            {sending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
            ) : (
              <><Send className="w-4 h-4 mr-2" /> Send Link</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
