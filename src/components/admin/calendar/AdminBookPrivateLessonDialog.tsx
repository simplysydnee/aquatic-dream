import { useEffect, useMemo, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import { getPrivateLessonPrice, isPromoDate } from "@/lib/privateLessonPricing";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";

interface Instructor { id: string; name: string }

interface Prefill {
  instructor_id?: string;
  instructor_name?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  pool_area?: string;
  lesson_type?: "private" | "semi_private";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: Prefill | null;
  onBooked: () => void;
}

type Step = "form" | "card" | "finalizing";

export default function AdminBookPrivateLessonDialog({ open, onOpenChange, prefill, onBooked }: Props) {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [lessonType, setLessonType] = useState<"private" | "semi_private">("private");
  const [instructorId, setInstructorId] = useState<string>("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("15:00");
  const [endTime, setEndTime] = useState("15:30");
  const [poolArea, setPoolArea] = useState("shallow");
  const [parentFirst, setParentFirst] = useState("");
  const [parentLast, setParentLast] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [childFirst, setChildFirst] = useState("");
  const [childLast, setChildLast] = useState("");
  const [childAge, setChildAge] = useState<string>("");
  const [childDob, setChildDob] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [seriesEnd, setSeriesEnd] = useState("");
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [collectCardOnFile, setCollectCardOnFile] = useState(true);
  const [priceOverride, setPriceOverride] = useState<string>("");

  // Stripe SetupIntent state
  const [stripeReady, setStripeReady] = useState<any>(null);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);

  useEffect(() => { getStripe().then(setStripeReady).catch(() => {}); }, []);

  useEffect(() => {
    if (!open) return;
    supabase.rpc("get_active_instructors_public").then(({ data }) => {
      setInstructors(((data as any[]) || []).map((i) => ({ id: i.id, name: i.name })));
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (prefill?.instructor_id) setInstructorId(prefill.instructor_id);
    if (prefill?.date) setDate(prefill.date);
    if (prefill?.start_time) setStartTime(prefill.start_time);
    if (prefill?.end_time) setEndTime(prefill.end_time);
    if (prefill?.pool_area) setPoolArea(prefill.pool_area);
    if (prefill?.lesson_type) setLessonType(prefill.lesson_type);
  }, [open, prefill]);

  const computedPrice = useMemo(
    () => getPrivateLessonPrice(lessonType, date),
    [lessonType, date],
  );
  const junePromo = isPromoDate(date);

  const reset = () => {
    setStep("form");
    setLessonType("private");
    setInstructorId("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setStartTime("15:00");
    setEndTime("15:30");
    setPoolArea("shallow");
    setParentFirst(""); setParentLast(""); setParentEmail(""); setParentPhone("");
    setChildFirst(""); setChildLast(""); setChildAge(""); setChildDob("");
    setNotes(""); setRecurring(false); setSeriesEnd("");
    setSendConfirmation(true); setCollectCardOnFile(true); setPriceOverride("");
    setSetupClientSecret(null); setCheckoutSessionId(null); setStripeCustomerId(null);
  };

  const finalizeBooking = useCallback(async (sessionId: string | null, customerId: string | null) => {
    setStep("finalizing");
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-private-booking", {
        body: {
          instructor_id: instructorId,
          lesson_type: lessonType,
          start_date: date,
          start_time: startTime,
          end_time: endTime,
          pool_area: poolArea,
          parent_name: `${parentFirst} ${parentLast}`.trim(),
          parent_first_name: parentFirst,
          parent_last_name: parentLast,
          parent_email: parentEmail.trim().toLowerCase(),
          parent_phone: parentPhone || null,
          child_name: childFirst || childLast ? `${childFirst} ${childLast}`.trim() : null,
          child_first_name: childFirst || null,
          child_last_name: childLast || null,
          child_age: childAge ? Number(childAge) : null,
          child_dob: childDob || null,
          notes: notes || null,
          recurring,
          series_end: recurring ? seriesEnd : null,
          price_per_session: priceOverride ? Number(priceOverride) : undefined,
          send_confirmation: sendConfirmation,
          collect_card_on_file: collectCardOnFile,
          stripe_environment: getStripeEnvironment(),
          stripe_customer_id: customerId,
          stripe_checkout_session_id: sessionId,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success(
        `Booking created${(data as any)?.occurrences ? ` — ${(data as any).occurrences} lesson(s)` : ""}${collectCardOnFile ? " with card on file" : ""}${sendConfirmation ? " — confirmation email sent" : ""}`
      );
      reset();
      onBooked();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to create booking");
      setStep(collectCardOnFile && sessionId ? "card" : "form");
    }
  }, [
    instructorId, lessonType, date, startTime, endTime, poolArea,
    parentFirst, parentLast, parentEmail, parentPhone,
    childFirst, childLast, childAge, notes, recurring, seriesEnd,
    priceOverride, sendConfirmation, collectCardOnFile,
    onBooked, onOpenChange,
  ]);

  const handleSubmit = async () => {
    if (!instructorId) { toast.error("Pick an instructor"); return; }
    if (!parentFirst || !parentLast || !parentEmail) { toast.error("Parent name and email required"); return; }
    if (recurring && !seriesEnd) { toast.error("Pick a series end date"); return; }

    // No card requested → create booking directly
    if (!collectCardOnFile) {
      setSubmitting(true);
      await finalizeBooking(null, null);
      setSubmitting(false);
      return;
    }

    // Card requested → open Stripe Setup Checkout first
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-private-booking-setup", {
        body: {
          environment: getStripeEnvironment(),
          parent_first_name: parentFirst,
          parent_last_name: parentLast,
          parent_email: parentEmail.trim().toLowerCase(),
          parent_phone: parentPhone || null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setSetupClientSecret((data as any).client_secret);
      setCheckoutSessionId((data as any).checkout_session_id);
      setStripeCustomerId((data as any).customer_id);
      setStep("card");
    } catch (e: any) {
      toast.error(e?.message || "Could not start card setup");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCardComplete = useCallback(() => {
    if (!checkoutSessionId) return;
    finalizeBooking(checkoutSessionId, stripeCustomerId);
  }, [checkoutSessionId, stripeCustomerId, finalizeBooking]);

  const checkoutOptions = useMemo(
    () => ({
      fetchClientSecret: () => Promise.resolve(setupClientSecret || ""),
      onComplete: handleCardComplete,
    }),
    [setupClientSecret, handleCardComplete],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "form" && "Book Private Lesson"}
            {step === "card" && "Save card on file"}
            {step === "finalizing" && "Finalizing booking…"}
          </DialogTitle>
          <DialogDescription>
            {step === "form" && "Create a private or semi-private lesson booking. Confirmation email includes lesson dates, price, waiver link, and Add to Calendar."}
            {step === "card" && "Stripe will securely save the parent's card. No charge today — we'll charge on the day of each lesson."}
            {step === "finalizing" && "Saving booking and sending confirmation…"}
          </DialogDescription>
        </DialogHeader>

        {step === "form" && (
        <div className="grid gap-4">
          {/* Lesson type + instructor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Lesson type</Label>
              <Select value={lessonType} onValueChange={(v) => setLessonType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="semi_private">Semi-Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Instructor</Label>
              <Select value={instructorId} onValueChange={setInstructorId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {instructors.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date + times */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Start</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <Label>End</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          {/* Pool area + recurring */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Pool area</Label>
              <Select value={poolArea} onValueChange={setPoolArea}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shallow">Shallow</SelectItem>
                  <SelectItem value="deep">Deep</SelectItem>
                  <SelectItem value="full">Full pool</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3 pb-1">
              <div className="flex items-center gap-2">
                <Switch checked={recurring} onCheckedChange={setRecurring} id="recurring" />
                <Label htmlFor="recurring" className="cursor-pointer">Repeat weekly</Label>
              </div>
            </div>
          </div>
          {recurring && (
            <div>
              <Label>Series ends on</Label>
              <Input type="date" value={seriesEnd} onChange={(e) => setSeriesEnd(e.target.value)} min={date} />
              <p className="text-xs text-muted-foreground mt-1">A lesson will be created each week on the same day from {date} through this date.</p>
            </div>
          )}

          {/* Parent */}
          <div className="border-t pt-3 grid gap-3">
            <p className="text-sm font-semibold">Parent / Guardian</p>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="First name" value={parentFirst} onChange={(e) => setParentFirst(e.target.value)} />
              <Input placeholder="Last name" value={parentLast} onChange={(e) => setParentLast(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input type="email" placeholder="Email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} />
              <Input placeholder="Phone" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
            </div>
          </div>

          {/* Child */}
          <div className="border-t pt-3 grid gap-3">
            <p className="text-sm font-semibold">Swimmer</p>
            <div className="grid grid-cols-3 gap-3">
              <Input placeholder="First name" value={childFirst} onChange={(e) => setChildFirst(e.target.value)} />
              <Input placeholder="Last name" value={childLast} onChange={(e) => setChildLast(e.target.value)} />
              <Input type="number" placeholder="Age" value={childAge} onChange={(e) => setChildAge(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Date of birth (optional — used to skip the waiver if already signed)</Label>
              <Input type="date" value={childDob} onChange={(e) => setChildDob(e.target.value)} />
            </div>
          </div>

          {/* Price + options */}
          <div className="border-t pt-3 grid gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Price per session</p>
              <div className="flex items-center gap-2">
                {junePromo && lessonType === "private" && (
                  <Badge variant="secondary">June promo: $50</Badge>
                )}
                <span className="text-sm text-muted-foreground">Default: ${computedPrice}</span>
              </div>
            </div>
            <Input
              type="number"
              placeholder={`Leave blank to use $${computedPrice}`}
              value={priceOverride}
              onChange={(e) => setPriceOverride(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              For recurring series, each occurrence is auto-priced at charge time ($50 in June, $65 otherwise for private).
            </p>
          </div>

          <div>
            <Label>Notes (internal + email)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Medical notes, special requests, etc." />
          </div>

          <div className="border-t pt-3 grid gap-2">
            <div className="flex items-center gap-2">
              <Switch checked={sendConfirmation} onCheckedChange={setSendConfirmation} id="send-conf" />
              <Label htmlFor="send-conf" className="cursor-pointer text-sm">
                Email confirmation to parent (lesson dates, price, waiver link, calendar links)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={collectCardOnFile} onCheckedChange={setCollectCardOnFile} id="cof" />
              <Label htmlFor="cof" className="cursor-pointer text-sm">
                Collect card on file now (parent enters card in next step)
              </Label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {collectCardOnFile
                ? "After saving, Stripe's secure card form will load in this dialog. The card is saved to the parent's Stripe customer and charged the day of each lesson."
                : "No card will be saved. You can collect payment manually."}
            </p>
          </div>
        </div>
        )}

        {step === "card" && setupClientSecret && stripeReady && (
          <div className="grid gap-3">
            <div className="text-sm text-muted-foreground">
              Parent: <span className="font-medium text-foreground">{parentFirst} {parentLast}</span> · {parentEmail}
            </div>
            <div className="border border-border rounded-lg bg-card overflow-hidden">
              <EmbeddedCheckoutProvider stripe={stripeReady} options={checkoutOptions}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
            <p className="text-[11px] text-muted-foreground">
              No charge today. Stripe stores the card on the parent's customer record for future per-lesson charges.
            </p>
          </div>
        )}

        {step === "finalizing" && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Creating booking and sending confirmation…
          </div>
        )}

        <DialogFooter>
          {step === "form" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {collectCardOnFile ? "Continue to card" : "Create booking"}
              </Button>
            </>
          )}
          {step === "card" && (
            <Button variant="ghost" onClick={() => setStep("form")}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
