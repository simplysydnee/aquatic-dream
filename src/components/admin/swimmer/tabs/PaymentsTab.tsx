import { useEffect, useMemo, useState, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ExternalLink, Send, DollarSign, CreditCard, Ban } from "lucide-react";
import type { Swimmer, SwimmerEnrollment } from "@/hooks/useSwimmers";
import { formatPaymentStatus, paymentStatusBadgeClass } from "@/lib/paymentLabels";
import { getStripeEnvironment } from "@/lib/stripe";
import CreditsSection from "./CreditsSection";
import LessonOccurrenceCheckoutDialog from "@/components/admin/calendar/LessonOccurrenceCheckoutDialog";

interface Props {
  swimmer: Swimmer;
  onChanged?: () => void;
}

type LessonOccurrence = {
  id: string;
  booking_id: string;
  occurrence_date: string;
  payment_status: string;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  stripe_session_id: string | null;
  status: string;
  cancelled_at: string | null;
  payment_link_sent_at: string | null;
  lesson_bookings: {
    start_time: string;
    end_time: string;
    instructor_name: string | null;
    price_per_session: number;
    lesson_type: string;
    parent_email: string;
  } | null;
};

type MarkTarget =
  | {
      kind: "enrollment";
      enrollment: SwimmerEnrollment;
      field: "payment_status" | "session_fee_status";
      label: string;
      amount: number;
    }
  | {
      kind: "occurrence";
      occurrenceId: string;
      label: string;
      amount: number;
    };

const fmtMoney = (n: number) => `$${n.toFixed(2)}`;
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");
const fmtTime = (t: string) => format(new Date(`2000-01-01T${t}`), "h:mm a");
const fmtDate = (d: string) => format(new Date(d + "T00:00:00"), "EEE, MMM d, yyyy");

const sessionFeeFor = (e: SwimmerEnrollment): number => {
  const sp = e.session?.session_price;
  if (sp != null) return Number(sp);
  const tl = e.session?.total_lessons;
  const ppl = e.session?.price_per_lesson;
  if (tl && ppl) return Number(tl) * Number(ppl);
  return 240;
};
const regFeeFor = (e: SwimmerEnrollment): number => Number(e.registration_fee ?? 45);

export default function PaymentsTab({ swimmer, onChanged }: Props) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markTarget, setMarkTarget] = useState<MarkTarget | null>(null);
  const [method, setMethod] = useState<"cash" | "check" | "comp">("cash");
  const [reference, setReference] = useState("");
  const [occurrences, setOccurrences] = useState<LessonOccurrence[]>([]);
  const [checkoutOccurrenceId, setCheckoutOccurrenceId] = useState<string | null>(null);

  const bookingIds = useMemo(() => swimmer.bookings.map((b) => b.id), [swimmer.bookings]);

  const loadOccurrences = useCallback(async () => {
    if (bookingIds.length === 0) {
      setOccurrences([]);
      return;
    }
    const { data, error } = await supabase
      .from("lesson_booking_occurrences")
      .select(
        "*, lesson_bookings!inner(start_time, end_time, instructor_name, price_per_session, lesson_type, parent_email)",
      )
      .in("booking_id", bookingIds)
      .order("occurrence_date", { ascending: true });
    if (!error) setOccurrences((data || []) as any);
  }, [bookingIds]);

  useEffect(() => {
    loadOccurrences();
  }, [loadOccurrences]);

  const balance = useMemo(() => {
    let due = 0;
    for (const e of swimmer.enrollments) {
      if (e.is_first_time && e.payment_status !== "paid" && e.payment_status !== "comp" && e.payment_status !== "waived") {
        due += regFeeFor(e);
      }
      if (e.session_fee_status === "due_day_1") due += sessionFeeFor(e);
    }
    for (const o of occurrences) {
      const isOpen =
        !o.cancelled_at &&
        o.payment_status !== "paid" &&
        o.payment_status !== "comp" &&
        o.payment_status !== "refunded";
      if (isOpen) due += Number(o.lesson_bookings?.price_per_session ?? 0);
    }
    return due;
  }, [swimmer.enrollments, occurrences]);

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
    const id = markTarget.kind === "enrollment" ? markTarget.enrollment.id : markTarget.occurrenceId;
    setBusyId(id);
    try {
      if (markTarget.kind === "enrollment") {
        const update: Record<string, any> = {
          [markTarget.field]: method === "comp" ? "comp" : "paid",
          payment_method: method,
          payment_reference: method === "comp" ? reference.trim() || "comp" : reference.trim(),
        };
        if (markTarget.field === "session_fee_status" && method !== "comp") {
          update.session_fee_paid_at = new Date().toISOString();
        }
        const { error } = await supabase.from("swim_enrollments").update(update).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("lesson_booking_occurrences")
          .update({
            payment_status: method === "comp" ? "comp" : "paid",
            paid_at: new Date().toISOString(),
            payment_method: method,
            payment_reference: method === "comp" ? reference.trim() || "comp" : reference.trim(),
          })
          .eq("id", id);
        if (error) throw error;
      }
      toast({ title: "Payment recorded", description: `${markTarget.label} marked ${method === "comp" ? "comp" : "paid"}` });
      setMarkTarget(null);
      await loadOccurrences();
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
        body: { enrollmentId: e.id, environment: getStripeEnvironment(), siteUrl: window.location.origin },
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

  const sendLessonLink = async (occurrenceId: string, parentEmail: string) => {
    setBusyId(occurrenceId);
    try {
      const { error } = await supabase.functions.invoke("send-lesson-booking-confirmation", {
        body: { occurrenceId, environment: getStripeEnvironment(), siteUrl: window.location.origin },
      });
      if (error) throw error;
      toast({ title: "Payment link emailed", description: `Sent to ${parentEmail}` });
      await loadOccurrences();
    } catch (err: any) {
      toast({ title: "Send failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const sendSeriesLink = async (bookingId: string, parentEmail: string) => {
    setBusyId(`series-${bookingId}`);
    try {
      const { error } = await supabase.functions.invoke("send-lesson-series-confirmation", {
        body: { bookingId, environment: getStripeEnvironment(), siteUrl: window.location.origin },
      });
      if (error) throw error;
      toast({ title: "Combined payment link emailed", description: `One link for all unpaid lessons sent to ${parentEmail}` });
      await loadOccurrences();
    } catch (err: any) {
      toast({ title: "Send failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  // Group unpaid, non-cancelled occurrences by booking so we can offer a
  // single combined Stripe link covering the entire remaining series.
  const unpaidByBooking = useMemo(() => {
    const map = new Map<string, LessonOccurrence[]>();
    for (const o of occurrences) {
      const open =
        !o.cancelled_at &&
        o.payment_status !== "paid" &&
        o.payment_status !== "comp" &&
        o.payment_status !== "refunded";
      if (!open) continue;
      const arr = map.get(o.booking_id) || [];
      arr.push(o);
      map.set(o.booking_id, arr);
    }
    return map;
  }, [occurrences]);

  if (swimmer.enrollments.length === 0 && swimmer.bookings.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-6 text-center">
        No enrollments or lessons with payment history yet.
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

      {swimmer.parent_email && <CreditsSection parentEmail={swimmer.parent_email} />}

      {/* Group enrollments (registration + session fee) */}
      {swimmer.enrollments.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Group classes</h4>
          {swimmer.enrollments
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
            .map((e) => {
              const sessionLabel =
                e.session?.period?.name || `${e.swim_level} · ${e.session?.day_of_week || "—"}`;
              const sessDue = e.session_fee_status === "due_day_1";
              return (
                <div key={e.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{sessionLabel}</div>
                      <div className="text-xs text-muted-foreground">Enrolled {fmt(e.created_at)}</div>
                    </div>
                  </div>

                  {e.is_first_time && (
                    <PaymentRow
                      label="Registration fee"
                      amount={regFeeFor(e)}
                      status={e.payment_status}
                      paidAt={null}
                      method={e.payment_method}
                      reference={e.payment_reference}
                      stripeId={e.stripe_payment_id}
                      busy={busyId === e.id}
                      onMark={() =>
                        openMark({
                          kind: "enrollment",
                          enrollment: e,
                          field: "payment_status",
                          label: "Registration fee",
                          amount: regFeeFor(e),
                        })
                      }
                    />
                  )}

                  <PaymentRow
                    label="Session fee"
                    amount={sessionFeeFor(e)}
                    status={e.session_fee_status}
                    paidAt={e.session_fee_paid_at}
                    method={e.payment_method}
                    reference={e.payment_reference}
                    stripeId={e.session_fee_stripe_id}
                    busy={busyId === e.id}
                    onMark={() =>
                      openMark({
                        kind: "enrollment",
                        enrollment: e,
                        field: "session_fee_status",
                        label: "Session fee",
                        amount: sessionFeeFor(e),
                      })
                    }
                    onSendStripe={sessDue ? () => sendStripeLink(e) : undefined}
                  />
                </div>
              );
            })}
        </div>
      )}

      {/* Private / semi-private lesson occurrences */}
      {occurrences.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Private / semi-private lessons ({occurrences.length})
          </h4>
          {occurrences.map((o) => {
            const lb = o.lesson_bookings;
            const price = Number(lb?.price_per_session ?? 0);
            const lessonTypeLabel = lb?.lesson_type === "private" ? "Private" : "Semi-private";
            const cancelled = !!o.cancelled_at;
            const isPaid = o.payment_status === "paid" || o.payment_status === "comp";
            const status = cancelled ? "cancelled" : o.payment_status;
            return (
              <div key={o.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{fmtDate(o.occurrence_date)}</div>
                    <div className="text-xs text-muted-foreground">
                      {lb ? `${fmtTime(lb.start_time)} – ${fmtTime(lb.end_time)}` : ""} · {lessonTypeLabel} lesson
                      {lb?.instructor_name ? ` · ${lb.instructor_name}` : ""}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cancelled ? "bg-muted text-muted-foreground border-border" : paymentStatusBadgeClass(o.payment_status)}
                  >
                    {cancelled ? "Cancelled" : formatPaymentStatus(o.payment_status)}
                  </Badge>
                </div>

                <div className="rounded-md border bg-muted/20 p-2.5 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Lesson fee</span>
                    <span className="text-muted-foreground">{fmtMoney(price)}</span>
                  </div>

                  {isPaid && (
                    <div className="text-muted-foreground">
                      {o.payment_method && <>via {o.payment_method}{o.payment_reference ? ` · ${o.payment_reference}` : ""}</>}
                      {o.paid_at && <> · {fmt(o.paid_at)}</>}
                      {o.stripe_session_id && (
                        <a
                          href={`https://dashboard.stripe.com/payments/${o.stripe_session_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          Stripe <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}

                  {cancelled && (
                    <div className="text-muted-foreground inline-flex items-center gap-1">
                      <Ban className="h-3 w-3" /> Cancelled {fmt(o.cancelled_at)}
                    </div>
                  )}

                  {!isPaid && !cancelled && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          openMark({
                            kind: "occurrence",
                            occurrenceId: o.id,
                            label: `Lesson on ${fmtDate(o.occurrence_date)}`,
                            amount: price,
                          })
                        }
                        disabled={busyId === o.id}
                        className="h-7 text-xs gap-1"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Mark paid (cash/check)
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCheckoutOccurrenceId(o.id)}
                        disabled={busyId === o.id}
                        className="h-7 text-xs gap-1"
                      >
                        <CreditCard className="h-3 w-3" /> Charge card
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => sendLessonLink(o.id, lb?.parent_email || swimmer.parent_email)}
                        disabled={busyId === o.id}
                        className="h-7 text-xs gap-1"
                      >
                        <Send className="h-3 w-3" />
                        {o.payment_link_sent_at ? "Resend payment link" : "Email payment link"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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

      <LessonOccurrenceCheckoutDialog
        open={!!checkoutOccurrenceId}
        onOpenChange={(v) => {
          if (!v) {
            setCheckoutOccurrenceId(null);
            loadOccurrences();
            onChanged?.();
          }
        }}
        occurrenceId={checkoutOccurrenceId}
        title="Charge card for lesson"
      />
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
  busy: boolean;
  onMark: () => void;
  onSendStripe?: () => void;
}) {
  const { label, amount, status, paidAt, method, reference, stripeId, busy, onMark, onSendStripe } = props;
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
          {onSendStripe && (
            <Button size="sm" variant="outline" onClick={onSendStripe} disabled={busy} className="h-7 text-xs gap-1">
              <Send className="h-3 w-3" /> Email Stripe link
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
