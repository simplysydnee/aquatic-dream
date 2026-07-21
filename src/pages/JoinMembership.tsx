import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Check } from "lucide-react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";

type Plan = {
  id: string;
  plan_key: "kid_group" | "private" | "adult_group";
  name: string;
  monthly_price_cents: number;
};
type Slot = {
  id: string;
  plan_id: string;
  plan_key: Plan["plan_key"];
  plan_name: string;
  monthly_price_cents: number;
  instructor_name: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  spots_left: number;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${m.toString().padStart(2, "0")}${period}`;
};
const fmtPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`;

export default function JoinMembership() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
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
      const { data, error } = await supabase.functions.invoke("get-open-slots");
      if (error) toast.error("Could not load plans");
      else {
        setPlans(data.plans || []);
        setSlots(data.slots || []);
      }
      setLoading(false);
    })();
  }, []);

  const planSlots = useMemo(
    () => (plan ? slots.filter((s) => s.plan_id === plan.id) : []),
    [plan, slots]
  );

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
    toast.success("Payment coming in the next step.");
  };

  return (
    <div className="min-h-screen bg-[#F7F3EE]">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-[#1a3a8a]">Join Aquatic Dreams</h1>
          <p className="mt-2 text-[#2a5e84]">Monthly swim membership. Cancel anytime.</p>
        </div>

        <div className="mb-6 flex items-center justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
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
            {step === 1 && (
              <>
                <h2 className="mb-4 text-xl font-semibold text-[#1a3a8a]">Pick a program</h2>
                <div className="space-y-3">
                  {plans.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setPlan(p);
                        setSlot(null);
                        setStep(2);
                      }}
                      className="flex w-full items-center justify-between rounded-lg border-2 border-[#2a5e84]/20 p-4 text-left transition hover:border-[#F58B76] hover:bg-[#F58B76]/5"
                    >
                      <div>
                        <div className="font-semibold text-[#1a3a8a]">{p.name}</div>
                        <div className="text-sm text-[#2a5e84]">Recurring monthly</div>
                      </div>
                      <div className="text-lg font-bold text-[#F58B76]">
                        {fmtPrice(p.monthly_price_cents)}/mo
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 2 && plan && (
              <>
                <button
                  onClick={() => setStep(1)}
                  className="mb-4 flex items-center gap-1 text-sm text-[#2a5e84] hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <h2 className="mb-4 text-xl font-semibold text-[#1a3a8a]">
                  Pick a slot — {plan.name}
                </h2>
                {planSlots.length === 0 ? (
                  <p className="py-8 text-center text-[#2a5e84]">
                    No open slots right now. Please check back soon.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {planSlots.map((s) => (
                      <button
                        key={s.id}
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
                  onClick={() => setStep(4)}
                  className="mb-4 flex items-center gap-1 text-sm text-[#2a5e84] hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <h2 className="mb-4 text-xl font-semibold text-[#1a3a8a]">Review</h2>
                <dl className="space-y-3 rounded-lg bg-[#2a5e84]/5 p-4 text-sm">
                  <Row label="Program" value={plan.name} />
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
                  Payment step coming soon — nothing will be charged yet.
                </p>
              </>
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
