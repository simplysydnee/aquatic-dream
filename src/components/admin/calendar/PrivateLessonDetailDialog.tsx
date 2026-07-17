import { useState, useMemo, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import type { PrivateLessonBooking } from "@/hooks/useCalendarData";
import { Mail, User, Clock, CreditCard, ClipboardSignature, Trash2, Loader2, CalendarCog, DollarSign, Wallet, Link as LinkIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReschedulePrivateLessonDialog from "@/components/admin/booking/ReschedulePrivateLessonDialog";
import QuickEditLessonDialog, { type QuickEditLesson } from "@/components/admin/booking/QuickEditLessonDialog";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import ChargeConfirmDialog from "@/components/admin/calendar/ChargeConfirmDialog";
import { getPrivateLessonPrice, isPromoDate, PROMO_LABEL } from "@/lib/privateLessonPricing";

interface Props {
  lesson: PrivateLessonBooking | null;
  onClose: () => void;
  onChanged: () => void;
}

const SITE = "https://aquaticdreamsswim.com";

function fmtTime(t: string) {
  if (!t) return "";
  return format(new Date(`2000-01-01T${t}`), "h:mm a");
}

const paymentBadge = (status: string) => {
  const s = status || "unpaid";
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "Paid", cls: "bg-green-100 text-green-800 border-green-300" },
    card_on_file: { label: "Card on file", cls: "bg-blue-100 text-blue-800 border-blue-300" },
    unpaid: { label: "Unpaid", cls: "bg-orange-100 text-orange-800 border-orange-300" },
    comp: { label: "Comp", cls: "bg-purple-100 text-purple-800 border-purple-300" },
  };
  const m = map[s] || { label: s, cls: "bg-muted text-foreground border-border" };
  return <Badge className={m.cls} variant="outline">{m.label}</Badge>;
};

export default function PrivateLessonDetailDialog({ lesson, onClose, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<any | null>(null);
  const [quickEdit, setQuickEdit] = useState<QuickEditLesson | null>(null);

  // Card setup (embedded Stripe)
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [setupSessionId, setSetupSessionId] = useState<string | null>(null);
  const stripeReady = useMemo(() => getStripe(), []);

  // Manual mark-paid
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMethod, setManualMethod] = useState<string>("cash");
  const [manualRef, setManualRef] = useState<string>("");
  const [chargeConfirmOpen, setChargeConfirmOpen] = useState(false);

  // Reusable card-on-file probe (from this parent's other bookings)
  const [reusableCard, setReusableCard] = useState<{
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
    source_booking_id: string;
    source_child_name: string | null;
  } | null>(null);
  const [reuseDismissed, setReuseDismissed] = useState(false);

  const waiverUrl = lesson?.waiver_token ? `${SITE}/lesson-waiver/${lesson.waiver_token}` : null;
  const hasCardOnFile = !!lesson?.stripe_payment_method_id;
  const isPaid = lesson?.payment_status === "paid";
  const effectivePrice = lesson
    ? getPrivateLessonPrice(lesson.lesson_type ?? "private", lesson.occurrence_date)
    : 0;
  const isPromo = lesson ? isPromoDate(lesson.occurrence_date) && lesson.lesson_type !== "semi_private" : false;

  // Probe for a reusable card whenever the dialog opens on a booking
  // that does not yet have a card on file.
  useEffect(() => {
    let cancelled = false;
    setReusableCard(null);
    setReuseDismissed(false);
    if (!lesson || hasCardOnFile || isPaid) return;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("admin-setup-card-for-booking", {
          body: {
            action: "check",
            booking_id: lesson.booking_id,
            environment: getStripeEnvironment(),
          },
        });
        if (cancelled) return;
        if (error || (data as any)?.error) return;
        if ((data as any)?.found) setReusableCard(data as any);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [lesson?.booking_id, hasCardOnFile, isPaid]);

  const attachExistingCard = async () => {
    if (!reusableCard || !lesson) return;
    setBusy("attach");
    try {
      const { data, error } = await supabase.functions.invoke("admin-setup-card-for-booking", {
        body: {
          action: "attach_existing",
          booking_id: lesson.booking_id,
          source_booking_id: reusableCard.source_booking_id,
          environment: getStripeEnvironment(),
        },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      toast.success(`${reusableCard.brand.toUpperCase()} •••• ${reusableCard.last4} attached`);
      setReusableCard(null);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Could not attach card");
    } finally {
      setBusy(null);
    }
  };

  const resendConfirmation = async () => {
    setBusy("resend");
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-private-booking", {
        body: { resend_confirmation_for: lesson.booking_id },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      toast.success("Confirmation email re-sent");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  };

  const cancelOccurrence = async () => {
    if (!confirm("Cancel this lesson occurrence?")) return;
    setBusy("cancel");
    try {
      const { error } = await supabase
        .from("lesson_booking_occurrences")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", lesson.occurrence_id);
      if (error) throw error;
      toast.success("Lesson cancelled");
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  };

  const chargeCardOnFile = async () => {
    setBusy("charge");
    try {
      const { data, error } = await supabase.functions.invoke(
        "admin-charge-private-lesson-occurrence",
        {
          body: {
            occurrence_id: lesson.occurrence_id,
            environment: getStripeEnvironment(),
          },
        },
      );
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      toast.success("Card charged");
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Charge failed");
      throw e;
    } finally {
      setBusy(null);
    }
  };

  const emailCardLink = async () => {
    setBusy("emaillink");
    try {
      const { data, error } = await supabase.functions.invoke("admin-card-on-file-link", {
        body: {
          bookingId: lesson.booking_id,
          environment: getStripeEnvironment(),
          siteUrl: SITE,
          amountLabel: `$${effectivePrice}`,
        },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      const link = (data as any)?.paymentLink;
      if (link) {
        try { await navigator.clipboard.writeText(link); } catch { /* ignore */ }
        toast.success("Link emailed to parent and copied to clipboard");
      } else {
        toast.success("Link emailed to parent");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  };

  const startCardSetup = async () => {
    setBusy("setupstart");
    try {
      const { data, error } = await supabase.functions.invoke("admin-setup-card-for-booking", {
        body: {
          action: "start",
          booking_id: lesson.booking_id,
          environment: getStripeEnvironment(),
        },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      setSetupClientSecret((data as any).client_secret);
      setSetupSessionId((data as any).checkout_session_id);
    } catch (e: any) {
      toast.error(e?.message || "Could not start card setup");
    } finally {
      setBusy(null);
    }
  };

  const finalizeCardSetup = useCallback(async () => {
    if (!setupSessionId || !lesson) return;
    try {
      const { data, error } = await supabase.functions.invoke("admin-setup-card-for-booking", {
        body: {
          action: "finalize",
          booking_id: lesson.booking_id,
          checkout_session_id: setupSessionId,
          environment: getStripeEnvironment(),
        },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      toast.success("Card saved on file");
      setSetupClientSecret(null);
      setSetupSessionId(null);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Could not save card");
    }
  }, [setupSessionId, lesson?.booking_id, onChanged]);

  const checkoutOptions = useMemo(
    () => ({
      fetchClientSecret: () => Promise.resolve(setupClientSecret || ""),
      onComplete: finalizeCardSetup,
    }),
    [setupClientSecret, finalizeCardSetup],
  );

  if (!lesson) return null;

  const submitManual = async () => {
    setBusy("manual");
    try {
      const { error } = await supabase
        .from("lesson_booking_occurrences")
        .update({
          payment_status: manualMethod === "comp" ? "comp" : "paid",
          charge_status: "skipped",
          paid_at: new Date().toISOString(),
          payment_method: manualMethod,
          payment_reference: manualRef || null,
        })
        .eq("id", lesson.occurrence_id);
      if (error) throw error;
      toast.success("Marked paid");
      setManualOpen(false);
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={!!lesson} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {lesson.lesson_type === "semi_private" ? "Semi-Private Lesson" : "Private Lesson"}
            {paymentBadge(lesson.payment_status)}
          </DialogTitle>
          <DialogDescription>
            {format(new Date(lesson.occurrence_date + "T00:00:00"), "EEEE, MMMM d, yyyy")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" /> {fmtTime(lesson.start_time)} – {fmtTime(lesson.end_time)}</div>
          {lesson.instructor_name && (
            <div className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /> Coach {lesson.instructor_name}</div>
          )}
          <Separator />
          <div>
            <p className="font-semibold">{lesson.child_name || lesson.parent_name}</p>
            {lesson.child_age != null && <p className="text-xs text-muted-foreground">Age {lesson.child_age}</p>}
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Parent: {lesson.parent_name}</p>
            <p className="flex items-center gap-1"><Mail className="w-3 h-3" /> {lesson.parent_email}</p>
            {lesson.parent_phone && <p>📞 {lesson.parent_phone}</p>}
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-muted-foreground" /> Price</span>
            <span className="font-semibold">${lesson.price_per_session}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2"><ClipboardSignature className="w-4 h-4 text-muted-foreground" /> Waiver</span>
            <span>{lesson.waiver_signed_at ? <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">Signed</Badge> : <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">Not signed</Badge>}</span>
          </div>
          {waiverUrl && !lesson.waiver_signed_at && (
            <a href={waiverUrl} target="_blank" rel="noreferrer" className="text-xs text-primary break-all">{waiverUrl}</a>
          )}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /> Confirmation email</span>
            <span>
              {lesson.confirmation_email_status === "sent" ? (
                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                  Sent{lesson.confirmation_email_sent_at ? ` ${format(new Date(lesson.confirmation_email_sent_at), "MMM d, h:mm a")}` : ""}
                </Badge>
              ) : lesson.confirmation_email_status === "failed" ? (
                <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">Failed</Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Unknown</Badge>
              )}
            </span>
          </div>
          {lesson.confirmation_email_status === "failed" && lesson.confirmation_email_error && (
            <p className="text-xs text-red-700 bg-red-50 p-2 rounded break-words">{lesson.confirmation_email_error}</p>
          )}
          {lesson.notes && (
            <div className="text-xs text-muted-foreground bg-muted/40 p-2 rounded">
              <p className="font-semibold mb-1">Notes</p>{lesson.notes}
            </div>
          )}

          {/* Payment actions */}
          {!isPaid && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment</p>

                {/* Reusable card banner */}
                {reusableCard && !reuseDismissed && !hasCardOnFile && (
                  <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 space-y-2">
                    <p className="text-sm">
                      <span className="font-semibold">
                        {reusableCard.brand.toUpperCase()} •••• {reusableCard.last4}
                      </span>{" "}
                      is on file for this parent
                      {reusableCard.source_child_name
                        ? <> from {reusableCard.source_child_name}'s lesson</>
                        : null}.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Expires {String(reusableCard.exp_month).padStart(2, "0")}/{String(reusableCard.exp_year).slice(-2)}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={attachExistingCard} disabled={busy !== null}>
                        {busy === "attach" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CreditCard className="w-4 h-4 mr-1" />}
                        Use this card
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setReuseDismissed(true)} disabled={busy !== null}>
                        Collect a new card
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {hasCardOnFile && (
                    <Button size="sm" onClick={() => setChargeConfirmOpen(true)} disabled={busy !== null}>
                      {busy === "charge" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <DollarSign className="w-4 h-4 mr-1" />}
                      Charge ${lesson.price_per_session}
                    </Button>
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant={hasCardOnFile ? "outline" : "default"} disabled={busy !== null}>
                        <CreditCard className="w-4 h-4 mr-1" />
                        {hasCardOnFile ? "Update card" : "Add card on file"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="start">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={startCardSetup}
                        disabled={busy !== null}
                      >
                        {busy === "setupstart" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                        Enter card now
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={emailCardLink}
                        disabled={busy !== null}
                      >
                        {busy === "emaillink" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-2" />}
                        Email link to parent
                      </Button>
                    </PopoverContent>
                  </Popover>
                  <Button size="sm" variant="ghost" onClick={() => setManualOpen(true)} disabled={busy !== null}>
                    <Wallet className="w-4 h-4 mr-1" />
                    Mark paid manually
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Embedded Stripe Setup */}
          {setupClientSecret && stripeReady && (
            <div className="border border-border rounded-lg bg-card overflow-hidden mt-2">
              <EmbeddedCheckoutProvider stripe={stripeReady} options={checkoutOptions}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          )}

          {/* Manual paid form */}
          {manualOpen && (
            <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
              <p className="text-xs font-semibold">Record manual payment</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Method</Label>
                  <Select value={manualMethod} onValueChange={setManualMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="zelle">Zelle</SelectItem>
                      <SelectItem value="venmo">Venmo</SelectItem>
                      <SelectItem value="comp">Comp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Reference (optional)</Label>
                  <Input value={manualRef} onChange={(e) => setManualRef(e.target.value)} placeholder="Check #, note…" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setManualOpen(false)} disabled={busy !== null}>Cancel</Button>
                <Button size="sm" onClick={submitManual} disabled={busy !== null}>
                  {busy === "manual" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={resendConfirmation} disabled={busy !== null}>
            {busy === "resend" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}
            Resend confirmation
          </Button>
          <Button
            size="sm"
            onClick={() => setQuickEdit({
              booking_id: lesson.booking_id,
              occurrence_id: lesson.occurrence_id,
              occurrence_date: lesson.occurrence_date,
              start_time: lesson.start_time,
              end_time: lesson.end_time,
              instructor_id: lesson.instructor_id || null,
              instructor_name: lesson.instructor_name || null,
              child_name: lesson.child_name,
              parent_name: lesson.parent_name,
            })}
            disabled={busy !== null}
          >
            <CalendarCog className="w-4 h-4 mr-1" />
            Edit time / instructor
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              setBusy("reschedule");
              try {
                const { data, error } = await supabase
                  .from("lesson_bookings")
                  .select("id, child_name, parent_name, instructor_id, instructor_name, start_time, end_time, lesson_booking_occurrences(id, occurrence_date, status, start_time_override, end_time_override, instructor_override_id, instructor_override_name)")
                  .eq("id", lesson.booking_id)
                  .maybeSingle();
                if (error || !data) throw new Error(error?.message || "Could not load booking");
                setRescheduleBooking(data);
              } catch (e: any) {
                toast.error(e?.message || "Failed");
              } finally {
                setBusy(null);
              }
            }}
            disabled={busy !== null}
          >
            {busy === "reschedule" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Move series / advanced
          </Button>
          <Button variant="destructive" size="sm" onClick={cancelOccurrence} disabled={busy !== null}>
            {busy === "cancel" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
            Cancel lesson
          </Button>
          <Button size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
      <ReschedulePrivateLessonDialog
        open={!!rescheduleBooking}
        onOpenChange={(o) => { if (!o) setRescheduleBooking(null); }}
        booking={rescheduleBooking}
        initialOccurrenceId={lesson.occurrence_id}
        initialMode="one"
        onDone={() => { setRescheduleBooking(null); onChanged(); onClose(); }}
      />
      <QuickEditLessonDialog
        open={!!quickEdit}
        onOpenChange={(o) => { if (!o) setQuickEdit(null); }}
        lesson={quickEdit}
        onSaved={() => { setQuickEdit(null); onChanged(); onClose(); }}
      />
      <ChargeConfirmDialog
        open={chargeConfirmOpen}
        onOpenChange={setChargeConfirmOpen}
        amount={Number(lesson.price_per_session) || 0}
        parentName={lesson.parent_name}
        lessonDate={lesson.occurrence_date}
        onConfirm={chargeCardOnFile}
      />
    </Dialog>
  );
}
