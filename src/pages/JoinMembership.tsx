import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Check } from "lucide-react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";
import SwimAssessment from "@/components/swim-enrollment/SwimAssessment";
import type { SwimLevel } from "@/components/swim-enrollment/types";

type PlanKey = "kid_group" | "private" | "adult_group";
type Plan = {
  id: string;
  plan_key: PlanKey;
  name: string;
  monthly_price_cents: number;
};
type Slot = {
  id: string;
  plan_id: string;
  plan_key: PlanKey;
  plan_name: string;
  monthly_price_cents: number;
  instructor_name: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  spots_left: number;
  swim_level: SwimLevel | null;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SWIM_LEVELS: SwimLevel[] = ["white", "red", "yellow", "blue", "green"];
const LEVEL_LABELS: Record<SwimLevel, string> = {
  white: "White (Little Fins)",
  red: "Red (Reef Explorers)",
  yellow: "Yellow (Sea Scouts)",
  blue: "Blue (Deep Sea Divers)",
  green: "Green (Ocean Masters)",
};

const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${m.toString().padStart(2, "0")}${period}`;
};
const fmtPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`;

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export default function JoinMembership() {
  const [step, setStep] = useState<Step>(1);
  const [showAssessment, setShowAssessment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [swimLevel, setSwimLevel] = useState<SwimLevel | null>(null);
  const [childDob, setChildDob] = useState<string>("");
  const [form, setForm] = useState({
    child_first: "",
    child_last: "",
    parent_name: "",
    parent_email: "",
    parent_phone: "",
  });
  const [authRecurring, setAuthRecurring] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Plans come directly from membership_plans (public read) so Step 1
      // never depends on standing_slots availability.
      const { data: planRows, error: planErr } = await supabase
        .from("membership_plans")
        .select("id, plan_key, name, monthly_price_cents")
        .eq("active", true)
        .order("monthly_price_cents", { ascending: true });
      if (planErr) toast.error("Could not load plans");
      else setPlans((planRows as Plan[]) || []);
      setLoading(false);

      // Load open slots in the background via the service-role edge function.
      const { data: slotData } = await supabase.functions.invoke("get-open-slots");
      if (slotData?.slots) setSlots(slotData.slots);
    })();
  }, []);


  const planSlots = useMemo(() => {
    if (!plan) return [];
    let list = slots.filter((s) => s.plan_id === plan.id);
    if (plan.plan_key === "kid_group" && swimLevel) {
      list = list.filter((s) => s.swim_level === swimLevel);
    }
    return list;
  }, [plan, slots, swimLevel]);

  const selectPlan = (p: Plan) => {
    setPlan(p);
    setSlot(null);
    if (p.plan_key === "kid_group") {
      setSwimLevel(null);
      setShowAssessment(true);
    } else {
      setSwimLevel(null);
      setShowAssessment(false);
      setStep(2);
    }
  };

  const handleAssessmentComplete = (level: SwimLevel, _age: number, dob: string) => {
    setSwimLevel(level);
    setChildDob(dob);
    setShowAssessment(false);
    setStep(2);
  };

  const canContinueStep3 =
    form.child_first.trim() &&
    form.child_last.trim() &&
    form.parent_name.trim() &&
    /\S+@\S+\.\S+/.test(form.parent_email) &&
    form.parent_phone.trim().length >= 10;

  const canContinueStep4 = authRecurring && smsConsent;

  const handleFinalize = () => {
    if (!plan || !slot || !canContinueStep3 || !canContinueStep4) {
      toast.error("Please complete all fields");
      return;
    }
    setStep(6);
  };

  const [charges, setCharges] = useState<{ firstChargeCents: number; monthlyCents: number } | null>(
    null,
  );

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    if (!plan || !slot) throw new Error("Missing plan or slot");
    const { data, error } = await supabase.functions.invoke("create-membership-checkout", {
      body: {
        plan_key: plan.plan_key,
        standing_slot_id: slot.id,
        child_first_name: form.child_first,
        child_last_name: form.child_last,
        child_dob: childDob || null,
        swim_level: plan.plan_key === "kid_group" ? swimLevel : null,
        parent_name: form.parent_name,
        parent_email: form.parent_email,
        parent_phone: form.parent_phone,
        recurring_consent: authRecurring,
        sms_consent: smsConsent,
        returnUrl: `${window.location.origin}/join?membership=success&session_id={CHECKOUT_SESSION_ID}`,
      },
    });
    if (error || !data?.clientSecret) {
      const msg = String(error?.message || data?.error || "Failed to start checkout");
      toast.error(msg);
      throw new Error(msg);
    }
    setCharges({
      firstChargeCents: data.firstChargeCents ?? 0,
      monthlyCents: data.monthlyCents ?? plan.monthly_price_cents,
    });
    return data.clientSecret;
  }, [plan, slot, form, authRecurring, smsConsent, swimLevel, childDob]);

  const [returned, setReturned] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("membership") === "success") {
      setReturned(true);
      setStep(7);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#F7F3EE]">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-[#1a3a8a]">Join Aquatic Dreams</h1>
          <p className="mt-2 text-[#2a5e84]">Monthly swim membership. Cancel anytime.</p>
        </div>

        <div className="mb-6 flex items-center justify-center gap-2">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className={`h-2 w-10 rounded-full ${
                step >= n ? "bg-[#F58B76]" : "bg-[#2a5e84]/20"
              }`}
            />
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#2a5e84]" />
          </div>
        ) : (
          <Card className="p-6">
            {step === 1 && !showAssessment && (
              <>
                <h2 className="mb-4 text-xl font-semibold text-[#1a3a8a]">Pick a program</h2>
                {plans.length === 0 ? (
                  <p className="py-6 text-center text-[#2a5e84]">
                    No programs available right now. Please check back soon.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {plans.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectPlan(p)}
                        className="flex w-full items-center justify-between rounded-lg border-2 border-[#2a5e84]/20 p-4 text-left transition hover:border-[#F58B76] hover:bg-[#F58B76]/5"
                      >
                        <div>
                          <div className="font-semibold text-[#1a3a8a]">{p.name}</div>
                          <div className="text-sm text-[#2a5e84]">
                            {p.plan_key === "kid_group"
                              ? "Kids group class · we'll match your swimmer to the right level"
                              : p.plan_key === "private"
                              ? "One-on-one coaching"
                              : "Adult group class"}
                          </div>
                        </div>
                        <div className="text-lg font-bold text-[#F58B76]">
                          {fmtPrice(p.monthly_price_cents)}/mo
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {step === 1 && showAssessment && plan?.plan_key === "kid_group" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setShowAssessment(false);
                    setPlan(null);
                  }}
                  className="mb-4 flex items-center gap-1 text-sm text-[#2a5e84] hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to programs
                </button>
                <h2 className="mb-2 text-xl font-semibold text-[#1a3a8a]">Find Your Spot</h2>
                <p className="mb-6 text-sm text-[#2a5e84]">
                  A quick skill check to match your swimmer to the right group.
                </p>
                <SwimAssessment onComplete={handleAssessmentComplete} />
              </>
            )}

            {step === 2 && plan && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (plan.plan_key === "kid_group") {
                      setShowAssessment(true);
                      setStep(1);
                    } else {
                      setStep(1);
                    }
                  }}
                  className="mb-4 flex items-center gap-1 text-sm text-[#2a5e84] hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <h2 className="mb-4 text-xl font-semibold text-[#1a3a8a]">
                  Pick a slot — {plan.name}
                </h2>

                {plan.plan_key === "kid_group" && (
                  <div className="mb-4 flex items-center gap-3 rounded-lg border border-[#2a5e84]/20 bg-[#2a5e84]/5 p-3">
                    <div className="flex-1 text-sm text-[#1a3a8a]">
                      <div className="font-semibold">Recommended level</div>
                      <div className="text-xs text-[#2a5e84]">
                        Parent may override if you'd prefer a different group.
                      </div>
                    </div>
                    <Select value={swimLevel ?? ""} onValueChange={(v: SwimLevel) => setSwimLevel(v)}>
                      <SelectTrigger className="h-9 w-56 text-xs">
                        <SelectValue placeholder="Choose level…" />
                      </SelectTrigger>
                      <SelectContent>
                        {SWIM_LEVELS.map((lv) => (
                          <SelectItem key={lv} value={lv}>{LEVEL_LABELS[lv]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {planSlots.length === 0 ? (
                  <p className="py-8 text-center text-[#2a5e84]">
                    {plan.plan_key === "kid_group" && swimLevel
                      ? `No open ${LEVEL_LABELS[swimLevel]} slots right now. Try a different level or check back soon.`
                      : "No open slots right now. Please check back soon."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {planSlots.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSlot(s);
                          setStep(3);
                        }}
                        className="flex w-full items-center justify-between rounded-lg border-2 border-[#2a5e84]/20 p-4 text-left transition hover:border-[#F58B76] hover:bg-[#F58B76]/5"
                      >
                        <div>
                          <div className="font-semibold text-[#1a3a8a]">
                            {DAYS[s.day_of_week]} {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                          </div>
                          {s.instructor_name && (
                            <div className="text-sm text-[#2a5e84]">Coach {s.instructor_name}</div>
                          )}
                        </div>
                        <div className="text-sm font-medium text-[#F58B76]">
                          {s.spots_left} spot{s.spots_left === 1 ? "" : "s"} left
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="mb-4 flex items-center gap-1 text-sm text-[#2a5e84] hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <h2 className="mb-4 text-xl font-semibold text-[#1a3a8a]">Swimmer & parent info</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Child first name</Label>
                    <Input
                      value={form.child_first}
                      onChange={(e) => setForm({ ...form, child_first: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Child last name</Label>
                    <Input
                      value={form.child_last}
                      onChange={(e) => setForm({ ...form, child_last: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Parent name</Label>
                    <Input
                      value={form.parent_name}
                      onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Parent email</Label>
                    <Input
                      type="email"
                      value={form.parent_email}
                      onChange={(e) => setForm({ ...form, parent_email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Parent phone</Label>
                    <Input
                      type="tel"
                      value={form.parent_phone}
                      onChange={(e) => setForm({ ...form, parent_phone: e.target.value })}
                    />
                  </div>
                </div>
                <Button
                  className="mt-6 w-full bg-[#F58B76] hover:bg-[#F58B76]/90"
                  disabled={!canContinueStep3}
                  onClick={() => setStep(4)}
                >
                  Continue
                </Button>
              </>
            )}

            {step === 4 && plan && (
              <>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="mb-4 flex items-center gap-1 text-sm text-[#2a5e84] hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <h2 className="mb-4 text-xl font-semibold text-[#1a3a8a]">Agreement & consent</h2>
                <div className="mb-4 rounded-lg bg-[#2a5e84]/5 p-4 text-sm text-[#1a3a8a]">
                  You're enrolling in a monthly membership. Your card will be charged{" "}
                  <strong>{fmtPrice(plan.monthly_price_cents)}/month</strong> on the 1st,
                  automatically, until you cancel. Cancel anytime online with 30 days' notice.
                </div>
                <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-lg border border-[#2a5e84]/20 p-3">
                  <Checkbox
                    checked={authRecurring}
                    onCheckedChange={(v) => setAuthRecurring(v === true)}
                  />
                  <span className="text-sm text-[#1a3a8a]">
                    I authorize this recurring monthly charge of{" "}
                    {fmtPrice(plan.monthly_price_cents)} on the 1st of each month until I cancel.
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#2a5e84]/20 p-3">
                  <Checkbox
                    checked={smsConsent}
                    onCheckedChange={(v) => setSmsConsent(v === true)}
                  />
                  <span className="text-sm text-[#1a3a8a]">
                    I agree to receive SMS text messages from Aquatic Dreams Swim Modesto about my
                    swimmer's lessons, schedule changes, reminders, and closure notices. Message
                    frequency varies. Message and data rates may apply. Reply STOP to unsubscribe.
                    See our SMS Terms and Privacy Policy. Consent is not a condition of enrollment.
                  </span>
                </label>
                <Button
                  className="mt-6 w-full bg-[#F58B76] hover:bg-[#F58B76]/90"
                  disabled={!canContinueStep4}
                  onClick={() => setStep(5)}
                >
                  Continue
                </Button>
              </>
            )}

            {step === 5 && plan && slot && (
              <>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="mb-4 flex items-center gap-1 text-sm text-[#2a5e84] hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <h2 className="mb-4 text-xl font-semibold text-[#1a3a8a]">Review</h2>
                <dl className="space-y-3 rounded-lg bg-[#2a5e84]/5 p-4 text-sm">
                  <Row label="Program" value={plan.name} />
                  {plan.plan_key === "kid_group" && swimLevel && (
                    <Row label="Level" value={LEVEL_LABELS[swimLevel]} />
                  )}
                  <Row
                    label="Slot"
                    value={`${DAYS[slot.day_of_week]} ${fmtTime(slot.start_time)}–${fmtTime(slot.end_time)}`}
                  />
                  {slot.instructor_name && (
                    <Row label="Instructor" value={`Coach ${slot.instructor_name}`} />
                  )}
                  <Row label="Swimmer" value={`${form.child_first} ${form.child_last}`} />
                  <Row label="Parent" value={form.parent_name} />
                  <Row label="Email" value={form.parent_email} />
                  <Row label="Phone" value={form.parent_phone} />
                  <div className="border-t border-[#2a5e84]/20 pt-3">
                    <Row
                      label="Monthly price"
                      value={
                        <span className="text-lg font-bold text-[#F58B76]">
                          {fmtPrice(plan.monthly_price_cents)}/mo
                        </span>
                      }
                    />
                  </div>
                </dl>
                <Button
                  className="mt-6 w-full bg-[#F58B76] hover:bg-[#F58B76]/90"
                  onClick={handleFinalize}
                >
                  <Check className="mr-2 h-4 w-4" /> Continue to secure payment
                </Button>
                <p className="mt-2 text-center text-xs text-[#2a5e84]">
                  Test mode — use card 4242 4242 4242 4242 with any future expiry & CVC.
                </p>
              </>
            )}

            {step === 6 && plan && slot && !returned && (
              <>
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="mb-4 flex items-center gap-1 text-sm text-[#2a5e84] hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <h2 className="mb-2 text-xl font-semibold text-[#1a3a8a]">Secure payment</h2>
                <p className="mb-4 text-sm text-[#2a5e84]">
                  Card will be charged the prorated first month now, then{" "}
                  <strong>{fmtPrice(plan.monthly_price_cents)}</strong> on the 1st of every month
                  until you cancel.
                </p>
                <div className="overflow-hidden rounded-lg border border-[#2a5e84]/20">
                  <EmbeddedCheckoutProvider
                    stripe={getStripe()}
                    options={{ fetchClientSecret }}
                  >
                    <EmbeddedCheckout />
                  </EmbeddedCheckoutProvider>
                </div>
              </>
            )}

            {step === 7 && (
              <div className="py-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F58B76]/15">
                  <Check className="h-7 w-7 text-[#F58B76]" />
                </div>
                <h2 className="mb-2 text-2xl font-semibold text-[#1a3a8a]">You're enrolled!</h2>
                <p className="text-[#2a5e84]">
                  {charges
                    ? `First payment of ${fmtPrice(charges.firstChargeCents)} today, then ${fmtPrice(charges.monthlyCents)}/month on the 1st.`
                    : "Your membership is confirmed. Watch your email for confirmation."}
                </p>
                <p className="mt-2 text-sm text-[#2a5e84]/80">
                  We'll send a welcome email with your first class details shortly.
                </p>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[#2a5e84]">{label}</dt>
      <dd className="text-right font-medium text-[#1a3a8a]">{value}</dd>
    </div>
  );
}
