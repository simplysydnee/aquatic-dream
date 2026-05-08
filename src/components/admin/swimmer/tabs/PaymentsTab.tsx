import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ExternalLink, Send, DollarSign } from "lucide-react";
import type { Swimmer, SwimmerEnrollment } from "@/hooks/useSwimmers";
import { formatPaymentStatus, paymentStatusBadgeClass } from "@/lib/paymentLabels";
import { getStripeEnvironment } from "@/lib/stripe";

interface Props {
  swimmer: Swimmer;
  onChanged?: () => void;
}

type MarkTarget = {
  enrollment: SwimmerEnrollment;
  field: "payment_status" | "session_fee_status";
  label: string;
  amount: number;
};

const fmtMoney = (n: number) => `$${n.toFixed(2)}`;
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

const sessionFeeFor = (e: SwimmerEnrollment): number => {
  const sp = e.session?.session_price;
  if (sp != null) return Number(sp);
  const tl = e.session?.total_lessons;
  const ppl = e.session?.price_per_lesson;
  if (tl && ppl) return Number(tl) * Number(ppl);
  return 240;
};
const regFeeFor = (e: SwimmerEnrollment): number =>
  Number(e.registration_fee ?? 45);

export default function PaymentsTab({ swimmer, onChanged }: Props) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markTarget, setMarkTarget] = useState<MarkTarget | null>(null);
  const [method, setMethod] = useState<"cash" | "check" | "comp">("cash");
  const [reference, setReference] = useState("");

  const balance = useMemo(() => {
    let due = 0;
    for (const e of swimmer.enrollments) {
      if (e.is_first_time && e.payment_status !== "paid" && e.payment_status !== "comp" && e.payment_status !== "waived") {
        due += regFeeFor(e);
      }
      if (e.session_fee_status === "due_day_1") due += sessionFeeFor(e);
    }
    return due;
  }, [swimmer.enrollments]);

  const openMark = (t: MarkTarget) => {
    setMarkTarget(t);
    setMethod("cash");
    setReference("");
  };

  const confirmMark = async () => {
    if (!markTarget) return;
    if (method !== "comp" && !reference.trim()) {
      toast({ title: "Reference required for cash/check", variant: "destructive" });
      return;
    }
    setBusyId(markTarget.enrollment.id);
    try {
      const update: Record<string, any> = {
        [markTarget.field]: method === "comp" ? "comp" : "paid",
        payment_method: method,
        payment_reference: method === "comp" ? reference.trim() || "comp" : reference.trim(),
      };
      if (markTarget.field === "session_fee_status" && method !== "comp") {
        update.session_fee_paid_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("swim_enrollments")
        .update(update)
        .eq("id", markTarget.enrollment.id);
      if (error) throw error;
      toast({ title: "Payment recorded", description: `${markTarget.label} marked ${method === "comp" ? "comp" : "paid"}` });
      setMarkTarget(null);
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const sendStripeLink = async (e: SwimmerEnrollment) => {
    setBusyId(e.id);
    try {
      const { error } = await supabase.functions.invoke("send-session-payment-link", {
        body: {
          enrollmentId: e.id,
          environment: getStripeEnvironment(),
          siteUrl: window.location.origin,
        },
      });
      if (error) throw error;
      toast({ title: "Stripe link emailed", description: `Sent to ${e.parent_email}` });
      onChanged?.();
    } catch (err: any) {
      toast({ title: "Send failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (swimmer.enrollments.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-6 text-center">
        No enrollments with payment history yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Outstanding balance</div>
          <div className="text-2xl font-bold text-foreground">{fmtMoney(balance)}</div>
        </div>
        <DollarSign className="h-8 w-8 text-muted-foreground/40" />
      </div>

      <div className="space-y-3">
        {swimmer.enrollments
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .map((e) => {
            const sessionLabel =
              e.session?.period?.name ||
              `${e.swim_level} · ${e.session?.day_of_week || "—"}`;
            const regDue = e.is_first_time && e.payment_status === "due_day_1";
            const sessDue = e.session_fee_status === "due_day_1";
            return (
              <div key={e.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{sessionLabel}</div>
                    <div className="text-xs text-muted-foreground">Enrolled {fmt(e.created_at)}</div>
                  </div>
                </div>

                {/* Registration fee row */}
                {e.is_first_time && (
                  <PaymentRow
                    label="Registration fee"
                    amount={regFeeFor(e)}
                    status={e.payment_status}
                    paidAt={null}
                    method={e.payment_method}
                    reference={e.payment_reference}
                    stripeId={e.stripe_payment_id}
                    canStripe={false}
                    busy={busyId === e.id}
                    onMark={() =>
                      openMark({
                        enrollment: e,
                        field: "payment_status",
                        label: "Registration fee",
                        amount: 45,
                      })
                    }
                  />
                )}

                {/* Session fee row */}
                <PaymentRow
                  label="Session fee"
                  amount={Number(e.payment_amount ?? 240)}
                  status={e.session_fee_status}
                  paidAt={e.session_fee_paid_at}
                  method={e.payment_method}
                  reference={e.payment_reference}
                  stripeId={e.session_fee_stripe_id}
                  canStripe={sessDue}
                  busy={busyId === e.id}
                  onMark={() =>
                    openMark({
                      enrollment: e,
                      field: "session_fee_status",
                      label: "Session fee",
                      amount: Number(e.payment_amount ?? 240),
                    })
                  }
                  onSendStripe={() => sendStripeLink(e)}
                />
              </div>
            );
          })}
      </div>

      {/* Mark paid dialog */}
      <Dialog open={!!markTarget} onOpenChange={(v) => !v && setMarkTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark {markTarget?.label} paid</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Recording {fmtMoney(markTarget?.amount ?? 0)} for{" "}
              <span className="font-medium text-foreground">{swimmer.child_name}</span>
            </div>
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="comp">Comp / waived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">
                {method === "check" ? "Check #" : method === "comp" ? "Reason (optional)" : "Receipt / reference"}
              </Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={method === "check" ? "e.g. 1042" : method === "comp" ? "e.g. scholarship" : "e.g. cash drawer #3"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMarkTarget(null)}>Cancel</Button>
            <Button onClick={confirmMark} disabled={!!busyId}>
              {busyId ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentRow(props: {
  label: string;
  amount: number;
  status: string;
  paidAt: string | null;
  method: string | null;
  reference: string | null;
  stripeId: string | null;
  canStripe: boolean;
  busy: boolean;
  onMark: () => void;
  onSendStripe?: () => void;
}) {
  const { label, amount, status, paidAt, method, reference, stripeId, canStripe, busy, onMark, onSendStripe } = props;
  const isPaid = status === "paid" || status === "comp";
  return (
    <div className="rounded-md border bg-muted/20 p-2.5 text-xs space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground">{fmtMoney(amount)}</span>
        </div>
        <Badge variant="outline" className={paymentStatusBadgeClass(status)}>
          {formatPaymentStatus(status)}
        </Badge>
      </div>
      {isPaid && (
        <div className="text-muted-foreground">
          {method && <>via {method}{reference ? ` · ${reference}` : ""}</>}
          {paidAt && <> · {fmt(paidAt)}</>}
          {stripeId && (
            <a
              href={`https://dashboard.stripe.com/payments/${stripeId}`}
              target="_blank"
              rel="noreferrer"
              className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              Stripe <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
      {!isPaid && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Button size="sm" variant="outline" onClick={onMark} disabled={busy} className="h-7 text-xs gap-1">
            <CheckCircle2 className="h-3 w-3" /> Mark paid (cash/check)
          </Button>
          {canStripe && onSendStripe && (
            <Button size="sm" variant="outline" onClick={onSendStripe} disabled={busy} className="h-7 text-xs gap-1">
              <Send className="h-3 w-3" /> Email Stripe link
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
