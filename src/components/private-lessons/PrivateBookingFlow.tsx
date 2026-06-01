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
import { Slot, releaseHolds } from "@/lib/privateBooking";
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
});

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

export default function PrivateBookingFlow() {
  const [step, setStep] = useState<Step>("info");
  const [sessionToken] = useState(() =>
    crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36));
  const [form, setForm] = useState({
    parentFirstName: "", parentLastName: "", parentEmail: "", parentPhone: "",
    childFirstName: "", childLastName: "", childDob: undefined as Date | undefined,
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slots, setSlots] = useState<Slot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [setup, setSetup] = useState<{ clientSecret: string; bookingId: string; checkoutSessionId: string } | null>(null);
  const [activeWaiver, setActiveWaiver] = useState<ActiveWaiver | null>(null);


  useEffect(() => {
    return () => { releaseHolds(sessionToken).catch(() => {}); };
  }, [sessionToken]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const computedAge = useMemo(() => (form.childDob ? calcAge(form.childDob) : null), [form.childDob]);
  const update = (k: string, v: any) => { setForm({ ...form, [k]: v }); if (errors[k]) setErrors({ ...errors, [k]: "" }); };

  const handleInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = infoSchema.safeParse(form);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { fe[i.path[0] as string] = i.message; });
      setErrors(fe);
      return;
    }
    // Look up an active waiver for this swimmer so we can skip the legal step
    // later if one already exists (same first/last name + DOB within 12 months).
    if (form.childDob) {
      const w = await lookupActiveWaiver(form.childFirstName, form.childLastName, form.childDob);
      setActiveWaiver(w);
    } else {
      setActiveWaiver(null);
    }
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
          parent_first_name: form.parentFirstName,
          parent_last_name: form.parentLastName,
          parent_email: form.parentEmail,
          parent_phone: form.parentPhone || null,
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
      if (error) throw new Error(error.message);
      if ((data as any)?.error === "slots_taken") {
        toast({ title: "Some slots were just taken", description: "Please pick different times.", variant: "destructive" });
        setStep("slots");
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


  if (step === "done") {
    return (
      <div className="max-w-lg mx-auto text-center py-10">
        <CheckCircle className="w-14 h-14 text-primary mx-auto mb-4" />
        <h3 className="font-display text-2xl font-bold mb-2">You're booked!</h3>
        <p className="text-muted-foreground mb-6">
          A confirmation email is on the way to <strong>{form.parentEmail}</strong> with your full schedule.
          We'll charge $65 to your card on the day of each lesson. No-shows and cancellations within 24 hours are charged in full.
        </p>
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
    return (
      <div>
        <div className="max-w-2xl mx-auto mb-4 p-4 border border-border rounded-lg bg-muted/30">
          <p className="text-sm font-semibold mb-2">{slots.length} lesson{slots.length === 1 ? "" : "s"} selected · ${slots.length * 65} total</p>
          <ul className="text-xs text-muted-foreground space-y-0.5 max-h-32 overflow-y-auto">
            {slots.map((s, i) => (
              <li key={i}>
                {new Date(s.slot_date + "T00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                {" · "}{formatTime(s.start_time)} · {s.instructor_name}
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
          onContinue={(s) => {
            setSlots(s);
            if (activeWaiver) {
              // Skip legal step entirely — submit using the on-file waiver data.
              const legal = legalDataFromWaiver(activeWaiver);
              // We need slots in handleLegalSubmit closure to be current, so wait a tick.
              setTimeout(() => handleLegalSubmit(legal), 0);
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
      <p className="text-muted-foreground text-sm mb-4">$65 per 30-minute lesson. Card on file required; charged the day of each lesson. Cancel free up to 24 hours before — late cancellations and no-shows are charged in full.</p>

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
          <Label>Phone</Label>
          <Input type="tel" value={form.parentPhone} onChange={(e) => update("parentPhone", e.target.value)} />
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

