import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Loader2 } from "lucide-react";


import { supabase } from "@/integrations/supabase/client";
import LegalAgreements, { LegalAgreementData } from "@/components/swim-enrollment/LegalAgreements";
import SlotPicker from "./SlotPicker";
import PrivateCardSetup from "./PrivateCardSetup";
import { getStripeEnvironment } from "@/lib/stripe";
import { Slot, releaseHolds, fetchOpenSlots } from "@/lib/privateBooking";
import { getPrivateLessonPrice, isPromoDate, PROMO_ACTIVE_FOR_TODAY, PROMO_LABEL, PRIVATE_PROMO_PRICE, PRIVATE_REGULAR_PRICE } from "@/lib/privateLessonPricing";
import { lookupActiveWaiver, legalDataFromWaiver, backfillVisitorWaiver, ActiveWaiver } from "@/lib/swimmerWaiver";

import { z } from "zod";
import { toast } from "@/hooks/use-toast";
import { CheckCircle } from "lucide-react";

type Step = "info" | "slots" | "legal" | "card" | "done";

const infoSchema = z.object({
  parentFirstName: z.string().trim().min(1),
  parentLastName: z.string().trim().min(1),
  parentEmail: z.string().trim().email(),
  parentPhone: z.string().trim().max(40).optional(),
  childFirstName: z.string().trim().min(1),
  childLastName: z.string().trim().min(1),
  childDob: z.date(),
  notes: z.string().max(1000).optional(),
  smsConsent: z.boolean().default(false),
}).refine(
  (d) => !d.smsConsent || (d.parentPhone && d.parentPhone.trim().length >= 7),
  { message: "Phone number is required to receive text messages", path: ["parentPhone"] }
);

function calcAge(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatSlotLabel(s: Slot): string {
  const d = new Date(s.slot_date + "T00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
  return `${d} · ${formatTime(s.start_time)} with ${s.instructor_name}`;
}

// Server returns "instructor_id|YYYY-MM-DD|HH:MM" — normalize both sides.
function conflictKey(instructorId: string, date: string, startTime: string): string {
  return `${instructorId}|${date}|${startTime.length >= 5 ? startTime.substring(0, 5) : startTime}`;
}


// Feature flag — keep OFF until we've manually completed a real test booking
// in preview. When OFF, the file behaves byte-for-byte like before this change.
const SELF_SERVE_CARD_REUSE_ENABLED =
  (import.meta.env.VITE_ENABLE_SELF_SERVE_CARD_REUSE as string | undefined) === "true";

type ReuseCard = {
  token: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
};

export default function PrivateBookingFlow() {
  const [step, setStep] = useState<Step>("info");
  const [sessionToken] = useState(() =>
    crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36));
  // Stable per-flow key so a retry of the same submission won't create a
  // duplicate "ghost" pending_card booking row.
  const [idempotencyKey] = useState(() =>
    crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36));
  const [form, setForm] = useState({
    parentFirstName: "", parentLastName: "", parentEmail: "", parentPhone: "",
    childFirstName: "", childLastName: "", childDob: undefined as Date | undefined,
    notes: "",
    smsConsent: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slots, setSlots] = useState<Slot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [setup, setSetup] = useState<{ clientSecret: string; bookingId: string; checkoutSessionId: string } | null>(null);
  const [activeWaiver, setActiveWaiver] = useState<ActiveWaiver | null>(null);
  const [reuseCard, setReuseCard] = useState<ReuseCard | null>(null);
  const [useReuse, setUseReuse] = useState(true);


  useEffect(() => {
    return () => { releaseHolds(sessionToken).catch(() => {}); };
  }, [sessionToken]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const computedAge = useMemo(() => (form.childDob ? calcAge(form.childDob) : null), [form.childDob]);
  const update = (k: string, v: any) => { setForm({ ...form, [k]: v }); if (errors[k]) setErrors({ ...errors, [k]: "" }); };

  // Additive, best-effort: look up a sibling card on file. Any error is
  // swallowed — the parent always retains the standard "enter a new card"
  // path on the next step regardless of what this returns.
  const tryLookupReusableCard = async () => {
    if (!SELF_SERVE_CARD_REUSE_ENABLED) return;
    try {
      const email = form.parentEmail.trim().toLowerCase();
      if (!email || !form.parentFirstName.trim() || !form.parentLastName.trim()) return;
      const { data, error } = await supabase.functions.invoke(
        "lookup-parent-card-on-file-public",
        {
          body: {
            parent_email: email,
            parent_first_name: form.parentFirstName.trim(),
            parent_last_name: form.parentLastName.trim(),
            environment: getStripeEnvironment(),
          },
        },
      );
      if (error) return;
      if (data?.has_card && data?.reuse_token) {
        setReuseCard({
          token: data.reuse_token,
          brand: data.brand,
          last4: data.last4,
          exp_month: data.exp_month,
          exp_year: data.exp_year,
        });
        setUseReuse(true);
      }
    } catch {
      /* purely additive — never block the booking */
    }
  };

  const handleInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = infoSchema.safeParse(form);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { fe[i.path[0] as string] = i.message; });
      setErrors(fe);
      return;
    }
    if (form.childDob) {
      const w = await lookupActiveWaiver(form.childFirstName, form.childLastName, form.childDob);
      setActiveWaiver(w);
    } else {
      setActiveWaiver(null);
    }
    // Fire-and-forget; never block step transition on lookup result.
    tryLookupReusableCard().catch(() => {});
    setStep("slots");
  };


  // Removes any slots matching the given server-returned conflict keys
  // ("instructor_id|date|HH:MM") from `slots` state. Returns the conflicting
  // slot objects (for a friendly toast message).
  const removeConflicts = (conflictKeys: string[]): Slot[] => {
    const set = new Set(conflictKeys);
    const removed: Slot[] = [];
    const kept: Slot[] = [];
    for (const s of slots) {
      if (set.has(conflictKey(s.instructor_id, s.slot_date, s.start_time))) {
        removed.push(s);
      } else {
        kept.push(s);
      }
    }
    setSlots(kept);
    return removed;
  };

  const handleSlotsTaken = (conflictKeys: string[]) => {
    const removed = removeConflicts(conflictKeys);
    const labels = removed.map(formatSlotLabel);
    toast({
      title: removed.length === 1
        ? "That time was just booked"
        : "Some times were just booked",
      description: labels.length
        ? `${labels.join(", ")} — we've removed ${removed.length === 1 ? "it" : "them"} from your cart. Please pick another time.`
        : "Please pick different times.",
      variant: "destructive",
    });
    setStep("slots");
  };

  const handleLegalSubmit = async (legal: LegalAgreementData, slotsOverride?: Slot[]) => {
    if (!form.childDob) return;
    const slotsToUse = slotsOverride ?? slots;

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-private-booking-setup", {
        body: {
          environment: getStripeEnvironment(),
          session_token: sessionToken,
          idempotency_key: idempotencyKey,
          reuse_token: SELF_SERVE_CARD_REUSE_ENABLED && useReuse && reuseCard ? reuseCard.token : undefined,
          parent_first_name: form.parentFirstName,
          parent_last_name: form.parentLastName,
          parent_email: form.parentEmail,
          parent_phone: form.parentPhone || null,
          sms_consent: !!form.smsConsent,
          child_first_name: form.childFirstName,
          child_last_name: form.childLastName,
          child_age: calcAge(form.childDob),
          notes: form.notes || null,
          slots: slotsToUse.map((s) => ({
            instructor_id: s.instructor_id,
            slot_date: s.slot_date,
            start_time: s.start_time,
            end_time: s.end_time,
          })),

          agreement: {
            waiver_accepted: legal.waiverAccepted,
            photo_release_accepted: legal.photoReleaseAccepted === "yes",
            privacy_policy_accepted: legal.privacyPolicyAccepted,
            terms_accepted: legal.termsAccepted,
            signature_text: legal.signatureText,
            emergency_contact_first_name: legal.emergencyContactFirstName,
            emergency_contact_last_name: legal.emergencyContactLastName,
            emergency_contact_phone: legal.emergencyContactPhone,
            emergency_contact_relationship: legal.emergencyContactRelationship,
          },
        },
      });
      if (error) {
        let serverMsg = error.message;
        let serverStep: string | undefined;
        let serverErrorCode: string | undefined;
        let conflicts: string[] | undefined;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) {
            serverErrorCode = typeof body.error === "string" ? body.error : undefined;
            serverMsg = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
          }
          if (body?.step) serverStep = body.step;
          if (Array.isArray(body?.conflicts)) conflicts = body.conflicts;
        } catch { /* ignore */ }
        // Friendly recovery for the 409 race: another parent grabbed the slot
        // while this customer was on the legal step.
        if (serverErrorCode === "slots_taken" || serverErrorCode === "slot_closed") {
          handleSlotsTaken(conflicts ?? []);
          return;
        }
        console.error("create-private-booking-setup failed", { step: serverStep, message: serverMsg });
        throw new Error(serverStep ? `[${serverStep}] ${serverMsg}` : serverMsg);
      }
      if ((data as any)?.error === "slots_taken" || (data as any)?.error === "slot_closed") {
        handleSlotsTaken(((data as any)?.conflicts as string[]) ?? []);
        return;
      }
      if (!data?.client_secret) throw new Error((data as any)?.error || "Could not start card setup");
      setSetup({ clientSecret: data.client_secret, bookingId: data.booking_id, checkoutSessionId: data.checkout_session_id });
      // If this was a freshly-signed waiver (not carried over), backfill visitor_waivers
      // so the next booking for the same swimmer auto-skips the legal step.
      if (!activeWaiver && form.childDob) {
        backfillVisitorWaiver({
          legal,
          signerEmail: form.parentEmail,
          child: { firstName: form.childFirstName, lastName: form.childLastName, dob: form.childDob },
        });
      }
      setStep("card");
    } catch (e: any) {
      toast({ title: "Could not save booking", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // Pre-flight: when entering the legal step, re-check live availability so
  // we catch a stolen slot BEFORE the customer fills out the waiver. If any
  // selected slot is no longer open, bounce back to the picker immediately.
  useEffect(() => {
    if (step !== "legal" || slots.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const from = new Date(); from.setHours(0, 0, 0, 0);
        const instructorIds = [...new Set(slots.map((s) => s.instructor_id))];
        const open = await fetchOpenSlots({ fromDate: from, weeks: 8, instructorIds, sessionToken });
        if (cancelled) return;
        const openKeys = new Set(open.map((s) => conflictKey(s.instructor_id, s.slot_date, s.start_time)));
        const stolen = slots
          .map((s) => conflictKey(s.instructor_id, s.slot_date, s.start_time))
          .filter((k) => !openKeys.has(k));
        if (stolen.length) handleSlotsTaken(stolen);
      } catch { /* network blip — let the server be the source of truth */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);




  if (step === "done") {
    const sortedSlots = [...slots].sort((a, b) =>
      a.slot_date === b.slot_date
        ? a.start_time.localeCompare(b.start_time)
        : a.slot_date.localeCompare(b.slot_date)
    );
    return (
      <div className="max-w-lg mx-auto text-center py-10">
        <CheckCircle className="w-14 h-14 text-primary mx-auto mb-4" />
        <h3 className="font-display text-2xl font-bold mb-2">You're booked!</h3>
        <p className="text-muted-foreground mb-6">
          A confirmation email is on the way to <strong>{form.parentEmail}</strong> with calendar links and your full schedule.
          We'll charge your card on the day of each lesson — June lessons are <strong className="text-foreground">$50 (June Special)</strong>, other lessons $65. No-shows and cancellations within 24 hours are charged in full.
        </p>
        {sortedSlots.length > 0 && (
          <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30 text-left">
            <p className="text-sm font-semibold mb-2 text-center">
              {sortedSlots.length} lesson{sortedSlots.length === 1 ? "" : "s"} booked
            </p>
            <ul className="text-sm space-y-1">
              {sortedSlots.map((s, i) => (
                <li key={i} className="text-foreground">
                  {new Date(s.slot_date + "T00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {" · "}{formatTime(s.start_time)} · {s.instructor_name}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Button asChild><a href="/">Back to home</a></Button>
      </div>
    );
  }


  if (step === "card" && setup) {
    return (
      <PrivateCardSetup
        setupClientSecret={setup.clientSecret}
        bookingId={setup.bookingId}
        checkoutSessionId={setup.checkoutSessionId}
        sessionToken={sessionToken}
        onComplete={() => setStep("done")}
        onBack={() => setStep("legal")}
      />
    );
  }

  if (step === "legal") {
    const perPrices = slots.map((s) => getPrivateLessonPrice("private", s.slot_date));
    const total = perPrices.reduce((a, b) => a + b, 0);
    const anyPromo = perPrices.some((p) => p < PRIVATE_REGULAR_PRICE);
    return (
      <div>
        <div className="max-w-2xl mx-auto mb-4 p-4 border border-border rounded-lg bg-muted/30">
          <p className="text-sm font-semibold mb-2">
            {slots.length} lesson{slots.length === 1 ? "" : "s"} selected ·{" "}
            {anyPromo && <span className="line-through text-muted-foreground mr-1">${slots.length * PRIVATE_REGULAR_PRICE}</span>}
            <span>${total} total</span>
            {anyPromo && <span className="ml-2 text-xs text-coral font-semibold uppercase tracking-wide">{PROMO_LABEL}</span>}
          </p>
          <ul className="text-xs text-muted-foreground space-y-0.5 max-h-32 overflow-y-auto">
            {slots.map((s, i) => (
              <li key={i}>
                {new Date(s.slot_date + "T00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                {" · "}{formatTime(s.start_time)} · {s.instructor_name}
                {isPromoDate(s.slot_date) && <span className="ml-1 text-coral font-semibold">· ${PRIVATE_PROMO_PRICE}</span>}
              </li>
            ))}
          </ul>
        </div>
        <LegalAgreements
          parentName={`${form.parentFirstName} ${form.parentLastName}`}
          childName={`${form.childFirstName} ${form.childLastName}`}
          onSubmit={handleLegalSubmit}
          onBack={() => setStep("slots")}
          submitting={submitting}
          signerFirstName={form.parentFirstName}
          signerLastName={form.parentLastName}
          signerPhone={form.parentPhone}
          signerLabel="Same as parent information"
        />
      </div>
    );
  }

  if (step === "slots") {
    return (
      <div>
        {activeWaiver && (
          <div className="max-w-2xl mx-auto mb-4 p-3 border border-primary/30 bg-primary/5 rounded-lg text-sm">
            ✓ Waiver on file for <strong>{form.childFirstName} {form.childLastName}</strong>. You won't need to re-sign — we'll go straight to payment after picking times.
          </div>
        )}
        <SlotPicker
          sessionToken={sessionToken}
          initialSelected={slots}
          onContinue={(s) => {
            setSlots(s);
            if (activeWaiver) {
              const legal = legalDataFromWaiver(activeWaiver);
              handleLegalSubmit(legal, s);
            } else {
              setStep("legal");
            }
          }}

          onBack={() => setStep("info")}
        />

      </div>
    );
  }


  return (
    <form onSubmit={handleInfoSubmit} className="max-w-lg mx-auto space-y-4">
      <h3 className="font-display text-2xl font-bold text-foreground mb-1">Book a private lesson</h3>
      {PROMO_ACTIVE_FOR_TODAY ? (
        <p className="text-muted-foreground text-sm mb-4">
          <span className="inline-flex items-center gap-1.5 mr-2 px-2 py-0.5 rounded-full bg-coral/15 border border-coral/30 text-xs font-semibold text-foreground">
            ★ {PROMO_LABEL} · <span className="line-through text-muted-foreground">${PRIVATE_REGULAR_PRICE}</span> ${PRIVATE_PROMO_PRICE}
          </span>
          per 30-minute lesson. Card on file required; charged the day of each lesson. Cancel free up to 24 hours before — late cancellations and no-shows are charged in full.
        </p>
      ) : (
        <p className="text-muted-foreground text-sm mb-4">${PRIVATE_REGULAR_PRICE} per 30-minute lesson. Card on file required; charged the day of each lesson. Cancel free up to 24 hours before — late cancellations and no-shows are charged in full.</p>
      )}

      <div>
        <Label>Parent / Guardian Name *</Label>
        <div className="grid sm:grid-cols-2 gap-3 mt-1">
          <div>
            <Input placeholder="First name" value={form.parentFirstName} onChange={(e) => update("parentFirstName", e.target.value)} />
            {errors.parentFirstName && <p className="text-xs text-destructive mt-1">{errors.parentFirstName}</p>}
          </div>
          <div>
            <Input placeholder="Last name" value={form.parentLastName} onChange={(e) => update("parentLastName", e.target.value)} />
            {errors.parentLastName && <p className="text-xs text-destructive mt-1">{errors.parentLastName}</p>}
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label>Email *</Label>
          <Input type="email" value={form.parentEmail} onChange={(e) => update("parentEmail", e.target.value)} />
          {errors.parentEmail && <p className="text-xs text-destructive mt-1">{errors.parentEmail}</p>}
        </div>
        <div>
          <Label>Phone (mobile, for text reminders)</Label>
          <Input type="tel" value={form.parentPhone} onChange={(e) => update("parentPhone", e.target.value)} />
          {errors.parentPhone && <p className="text-xs text-destructive mt-1">{errors.parentPhone}</p>}
        </div>
      </div>

      {/* SMS opt-in (TextMagic / 10DLC compliance) */}
      <div className="p-4 rounded-lg border border-border bg-muted/30">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="smsConsentPriv"
            checked={form.smsConsent}
            onChange={(e) => update("smsConsent", e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border accent-primary"
          />
          <div className="flex-1">
            <Label htmlFor="smsConsentPriv" className="text-sm font-semibold cursor-pointer">
              Text me lesson reminders &amp; schedule updates
            </Label>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              I agree to receive SMS text messages from <strong>Aquatic Dreams Swim Modesto</strong> about
              my swimmer's lessons, schedule changes, reminders, and account updates at the phone
              number above. Message frequency varies. Message and data rates may apply. Reply{" "}
              <strong>STOP</strong> to unsubscribe or <strong>HELP</strong> for help. See our{" "}
              <a href="/sms-terms" target="_blank" rel="noopener" className="underline hover:text-primary">SMS Terms</a>
              {" "}and{" "}
              <a href="/waivers" target="_blank" rel="noopener" className="underline hover:text-primary">Privacy Policy</a>.
              Consent is not a condition of enrollment.
            </p>
          </div>
        </div>
      </div>

      <div>
        <Label>Swimmer Name *</Label>
        <div className="grid sm:grid-cols-2 gap-3 mt-1">
          <div>
            <Input placeholder="First name" value={form.childFirstName} onChange={(e) => update("childFirstName", e.target.value)} />
            {errors.childFirstName && <p className="text-xs text-destructive mt-1">{errors.childFirstName}</p>}
          </div>
          <div>
            <Input placeholder="Last name" value={form.childLastName} onChange={(e) => update("childLastName", e.target.value)} />
            {errors.childLastName && <p className="text-xs text-destructive mt-1">{errors.childLastName}</p>}
          </div>
        </div>
      </div>

      <div>
        <Label>Swimmer Date of Birth *</Label>
        <DobPicker
          value={form.childDob}
          onChange={(d) => update("childDob", d)}
        />
        {computedAge !== null && <p className="text-xs text-muted-foreground mt-1">Age: {computedAge}</p>}
        {errors.childDob && <p className="text-xs text-destructive mt-1">{errors.childDob}</p>}
      </div>



      <div>
        <Label>Notes (optional)</Label>
        <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={3} maxLength={1000} />
      </div>

      <Button type="submit" className="w-full">Continue to pick times</Button>
    </form>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function DobPicker({ value, onChange }: { value: Date | undefined; onChange: (d: Date | undefined) => void }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear; y >= currentYear - 18; y--) arr.push(y);
    return arr;
  }, [currentYear]);

  const month = value ? value.getMonth() : "";
  const day = value ? value.getDate() : "";
  const year = value ? value.getFullYear() : "";

  const update = (next: { month?: number | ""; day?: number | ""; year?: number | "" }) => {
    const m = next.month !== undefined ? next.month : month;
    const y = next.year !== undefined ? next.year : year;
    let d = next.day !== undefined ? next.day : day;
    if (m === "" || y === "" || d === "") {
      // If incomplete, still try to render — but only emit a Date once all three are set
      if (m !== "" && y !== "") {
        const max = daysInMonth(Number(y), Number(m));
        if (d !== "" && Number(d) > max) d = max;
      }
      // Update partial state by passing through onChange only when complete
      // We need local state for partial selections — fall through below.
    }
    if (m !== "" && y !== "" && d !== "") {
      const max = daysInMonth(Number(y), Number(m));
      const clampedDay = Math.min(Number(d), max);
      onChange(new Date(Number(y), Number(m), clampedDay));
    } else {
      // Keep partial selection alive by storing as an invalid placeholder is hard;
      // instead, set undefined so the parent shows "incomplete".
      // To avoid losing partial picks, use the local refs below.
    }
  };

  // Local partial state so users can pick month/year before day, etc.
  const [partial, setPartial] = useState<{ m: number | ""; d: number | ""; y: number | "" }>({
    m: value ? value.getMonth() : "",
    d: value ? value.getDate() : "",
    y: value ? value.getFullYear() : "",
  });

  useEffect(() => {
    if (value) setPartial({ m: value.getMonth(), d: value.getDate(), y: value.getFullYear() });
  }, [value]);

  const commit = (next: { m: number | ""; d: number | ""; y: number | "" }) => {
    setPartial(next);
    if (next.m !== "" && next.d !== "" && next.y !== "") {
      const max = daysInMonth(Number(next.y), Number(next.m));
      const clampedDay = Math.min(Number(next.d), max);
      onChange(new Date(Number(next.y), Number(next.m), clampedDay));
    } else {
      onChange(undefined);
    }
  };

  const maxDay = partial.m !== "" && partial.y !== "" ? daysInMonth(Number(partial.y), Number(partial.m)) : 31;
  const dayOptions = Array.from({ length: maxDay }, (_, i) => i + 1);

  return (
    <div className="mt-1 grid grid-cols-3 gap-2">
      <Select
        value={partial.m === "" ? undefined : String(partial.m)}
        onValueChange={(v) => commit({ ...partial, m: Number(v) })}
      >
        <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
        <SelectContent className="max-h-64">
          {MONTHS.map((name, i) => <SelectItem key={i} value={String(i)}>{name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select
        value={partial.d === "" ? undefined : String(partial.d)}
        onValueChange={(v) => commit({ ...partial, d: Number(v) })}
      >
        <SelectTrigger><SelectValue placeholder="Day" /></SelectTrigger>
        <SelectContent className="max-h-64">
          {dayOptions.map((d) => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select
        value={partial.y === "" ? undefined : String(partial.y)}
        onValueChange={(v) => commit({ ...partial, y: Number(v) })}
      >
        <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
        <SelectContent className="max-h-64">
          {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

