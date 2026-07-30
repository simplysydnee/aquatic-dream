import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getMembershipStripe as getStripe, getMembershipStripeEnvironment as getStripeEnvironment } from "@/lib/stripe-membership";
import SwimAssessment from "@/components/swim-enrollment/SwimAssessment";
import LegalAgreements, { type LegalAgreementData } from "@/components/swim-enrollment/LegalAgreements";
import { LEVEL_GROUP_NAMES, type SwimLevel } from "@/components/swim-enrollment/types";
import ClosureScheduleNote from "@/components/ClosureScheduleNote";

import {
  lookupActiveWaiver,
  type ActiveWaiver,
} from "@/lib/swimmerWaiver";
import { submitVisitorWaiver } from "@/lib/visitorWaiver";
import {
  SMS_CONSENT_DISCLOSURE,
  SMS_CONSENT_VERSION,
} from "@/components/swim-enrollment/legal-content";
import {
  MEMBERSHIP_AGREEMENT_TEXT,
  MEMBERSHIP_AGREEMENT_VERSION,
} from "@/components/swim-enrollment/membership-agreement";

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
  is_full?: boolean;
  swim_level: SwimLevel | null;
  accepted_levels: SwimLevel[] | null;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SWIM_LEVELS: SwimLevel[] = ["white", "red", "yellow", "blue", "green"];
const LEVEL_LABELS = LEVEL_GROUP_NAMES;

const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${m.toString().padStart(2, "0")}${period}`;
};
const fmtPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`;

// Steps:
// 1 program, 2 slot, 3 info, 4 waiver (auto-skip if on file), 5 consent, 6 review, 7 checkout, 8 success
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

type HoldState = "none" | "loading" | "ok" | "expired" | "converted" | "cancelled" | "not_found";

/** Reads the hold token straight off the URL so first paint can be gated. */
const holdTokenFromUrl = (): string | null => {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  if (p.get("membership") === "success") return null;
  return p.get("hold");
};

const fmtHeldUntil = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
};

const HOLD_PROBLEMS: Record<
  "expired" | "converted" | "cancelled" | "not_found",
  { title: string; body: string }
> = {
  expired: {
    title: "That hold has expired",
    body:
      "We held this spot for a limited time and the window has passed, so the time is open to everyone again. You can enroll now and pick any time that works, or call us and we will hold one again.",
  },
  converted: {
    title: "This enrollment is already complete",
    body:
      "Someone already finished signing up with this link, so there is nothing left to do here. If you need to make a change or add another swimmer, give us a call.",
  },
  cancelled: {
    title: "This hold was released",
    body:
      "Our front desk released this spot, so it is no longer being saved. You can start a new enrollment and choose any open time.",
  },
  not_found: {
    title: "We could not find that reservation",
    body:
      "This link may have been mistyped or is no longer valid. You can start a normal enrollment and pick a time below.",
  },
};


export default function JoinMembership() {
  const [step, setStep] = useState<Step>(1);
  const [showAssessment, setShowAssessment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [swimLevel, setSwimLevel] = useState<SwimLevel | null>(null);
  const [childDob, setChildDob] = useState<string>("");
  const [form, setForm] = useState({
    child_first: "",
    child_last: "",
    parent_first: "",
    parent_last: "",
    parent_email: "",
    parent_phone: "",
    is_first_time: "" as "" | "yes" | "no",
    has_medical: "" as "" | "yes" | "no",
    medical_notes: "",
    notes: "",
  });
  const [authRecurring, setAuthRecurring] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);

  const [waiverId, setWaiverId] = useState<string | null>(null);
  const [waiverOnFile, setWaiverOnFile] = useState<ActiveWaiver | null>(null);
  const [waiverChecking, setWaiverChecking] = useState(false);
  const [waiverSubmitting, setWaiverSubmitting] = useState(false);

  // Phone-booked hold state (/join?hold=<token>).
  // Decided from the URL before first paint so the program picker never flashes.
  const [holdToken, setHoldToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    if (p.get("membership") === "success") return null;
    return p.get("hold");
  });
  const [holdState, setHoldState] = useState<HoldState>(() =>
    holdTokenFromUrl() ? "loading" : "none",
  );
  const [holdHeldUntil, setHoldHeldUntil] = useState<string | null>(null);
  const [holdSwimmerFirst, setHoldSwimmerFirst] = useState<string>("");
  const [releasingHold, setReleasingHold] = useState(false);
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
  const holdActive = holdState === "ok" && !!holdToken;

  const startNormalEnrollment = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("hold");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    setHoldToken(null);
    setHoldState("none");
    setHoldHeldUntil(null);
    setPlan(null);
    setSlot(null);
    setSwimLevel(null);
    setShowAssessment(false);
    setStep(1);
  }, []);

  const releaseHoldAndContinue = useCallback(async () => {
    if (!holdToken) return;
    setReleasingHold(true);
    const { error } = await supabase.functions.invoke("release-membership-hold", {
      body: { token: holdToken },
    });
    setReleasingHold(false);
    if (error) {
      toast.error("Could not release that spot. Please call us and we will help.");
      return;
    }
    setShowReleaseConfirm(false);
    toast.success("Spot released. Pick any time that works for you.");
    startNormalEnrollment();
  }, [holdToken, startNormalEnrollment]);



  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: planRows, error: planErr } = await supabase
        .from("membership_plans")
        .select("id, plan_key, name, monthly_price_cents")
      .eq("active", true)
      .order("monthly_price_cents", { ascending: true });
    if (planErr) toast.error("Could not load plans");
    else {
      const order = ["kid_group", "private", "adult_group"];
      const sorted = ((planRows as Plan[]) || []).sort(
        (a, b) => order.indexOf(a.plan_key) - order.indexOf(b.plan_key)
      );
      setPlans(sorted);
    }
      setLoading(false);
    })();
  }, []);

  const loadSlots = useCallback(async () => {
    if (!plan) return;
    setSlotsLoading(true);
    setSlotsError(false);
    try {
      const { data: slotData, error } = await supabase.functions.invoke("get-open-slots", {
        body: {
          plan_key: plan.plan_key,
          swim_level: plan.plan_key === "kid_group" ? swimLevel : undefined,
        },
      });
      if (error) throw error;
      setSlots(Array.isArray(slotData?.slots) ? slotData.slots : []);
    } catch (e) {
      console.error("loadSlots error", e);
      setSlotsError(true);
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [plan, swimLevel]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const planSlots = useMemo(() => {
    if (!plan) return [];
    let list = slots.filter((s) => s.plan_key === plan.plan_key);
    if (plan.plan_key === "kid_group" && swimLevel) {
      list = list.filter((s) =>
        s.accepted_levels && s.accepted_levels.length > 0
          ? s.accepted_levels.includes(swimLevel)
          : s.swim_level === swimLevel,
      );
    }
    return list;
  }, [plan, slots, swimLevel]);

  // Slot picker filters (step 2)
  const [filterDay, setFilterDay] = useState<string>("any");
  const [filterInstructor, setFilterInstructor] = useState<string>("any");
  const [filterTime, setFilterTime] = useState<string>("any");

  const resetFilters = useCallback(() => {
    setFilterDay("any");
    setFilterInstructor("any");
    setFilterTime("any");
  }, []);

  const dayOptions = useMemo(
    () => Array.from(new Set(planSlots.map((s) => s.day_of_week))).sort((a, b) => a - b),
    [planSlots],
  );
  const instructorOptions = useMemo(
    () =>
      Array.from(
        new Set(planSlots.map((s) => s.instructor_name).filter((n): n is string => !!n)),
      ).sort((a, b) => a.localeCompare(b)),
    [planSlots],
  );

  const timeBucket = (start: string) => {
    const hour = Number(start.slice(0, 2));
    if (hour < 12) return "morning";
    if (hour < 17) return "afternoon";
    return "evening";
  };

  const showFilterBar = planSlots.length > 8;

  const visibleSlots = useMemo(() => {
    if (!showFilterBar) return planSlots;
    return planSlots.filter((s) => {
      if (filterDay !== "any" && String(s.day_of_week) !== filterDay) return false;
      if (filterInstructor !== "any" && s.instructor_name !== filterInstructor) return false;
      if (filterTime !== "any" && timeBucket(s.start_time) !== filterTime) return false;
      return true;
    });
  }, [planSlots, showFilterBar, filterDay, filterInstructor, filterTime]);

  const groupedSlots = useMemo(() => {
    const map = new Map<number, Slot[]>();
    for (const s of visibleSlots) {
      if (!map.has(s.day_of_week)) map.set(s.day_of_week, []);
      map.get(s.day_of_week)!.push(s);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, list]) => ({
        day,
        list: [...list].sort((a, b) => a.start_time.localeCompare(b.start_time)),
      }));
  }, [visibleSlots]);

  // Membership waitlist — only ever populated by an explicit tap, never automatically.
  const [waitlistSlot, setWaitlistSlot] = useState<Slot | null>(null);

  const [waitlistSaved, setWaitlistSaved] = useState(false);
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistForm, setWaitlistForm] = useState({
    swimmer_name: "",
    parent_name: "",
    parent_email: "",
    parent_phone: "",
    notes: "",
  });

  const submitWaitlist = async () => {
    if (!waitlistSlot || !plan) return;
    if (
      !waitlistForm.swimmer_name.trim() ||
      !waitlistForm.parent_name.trim() ||
      !/\S+@\S+\.\S+/.test(waitlistForm.parent_email) ||
      waitlistForm.parent_phone.trim().length < 10
    ) {
      toast.error("Please complete all required fields");
      return;
    }
    setWaitlistSubmitting(true);
    const { error } = await supabase.from("membership_waitlist").insert({
      plan_key: plan.plan_key,
      standing_slot_id: waitlistSlot.id,
      swim_level: plan.plan_key === "kid_group" ? swimLevel : null,
      preferred_day: waitlistSlot.day_of_week,
      preferred_time: waitlistSlot.start_time,
      swimmer_name: waitlistForm.swimmer_name.trim(),
      parent_name: waitlistForm.parent_name.trim(),
      parent_email: waitlistForm.parent_email.trim(),
      parent_phone: waitlistForm.parent_phone.trim(),
      notes: waitlistForm.notes.trim() || null,
      status: "open",
    });
    setWaitlistSubmitting(false);
    if (error) {
      toast.error("Could not save your request. Please call (209) 577-3483.");
      return;
    }
    setWaitlistSaved(true);
  };

  const closeWaitlist = () => {
    setWaitlistSlot(null);
    setWaitlistSaved(false);
    setWaitlistForm({ swimmer_name: "", parent_name: "", parent_email: "", parent_phone: "", notes: "" });
  };


  const selectPlan = (p: Plan) => {
    setPlan(p);
    setSlot(null);
    resetFilters();

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
    setStep(holdToken ? 3 : 2);
  };


  const isAdult = plan?.plan_key === "adult_group";

  const canContinueStep3 = isAdult
    ? !!(
        form.child_first.trim() &&
        form.child_last.trim() &&
        childDob &&
        /\S+@\S+\.\S+/.test(form.parent_email) &&
        form.parent_phone.trim().length >= 10 &&
        form.is_first_time !== "" &&
        form.has_medical !== "" &&
        (form.has_medical !== "yes" || form.medical_notes.trim().length > 0)
      )
    : !!(
        form.child_first.trim() &&
        form.child_last.trim() &&
        childDob &&
        form.parent_first.trim() &&
        form.parent_last.trim() &&
        /\S+@\S+\.\S+/.test(form.parent_email) &&
        form.parent_phone.trim().length >= 10 &&
        form.is_first_time !== "" &&
        form.has_medical !== "" &&
        (form.has_medical !== "yes" || form.medical_notes.trim().length > 0)
      );

  const canContinueStep5 = authRecurring && smsConsent && agreementAccepted;

  // Advance from info: check for on-file waiver before rendering step 4.
  const handleInfoContinue = async () => {
    if (!canContinueStep3) {
      toast.error("Please complete all required fields");
      return;
    }
    // Adults: mirror swimmer name into parent contact fields so Stripe customer,
    // email, SMS, and waiver lookup all keep working unchanged downstream.
    if (isAdult) {
      setForm((prev) => ({
        ...prev,
        parent_first: prev.child_first,
        parent_last: prev.child_last,
      }));
    }
    setWaiverChecking(true);
    try {
      const existing = await lookupActiveWaiver(form.child_first, form.child_last, childDob);
      if (existing) {
        setWaiverOnFile(existing);
        setWaiverId(existing.waiver_id);
        toast.success("Waiver already on file — skipping the legal step");
        setStep(5);
        return;
      }
    } catch (e) {
      console.warn("waiver lookup failed", e);
    } finally {
      setWaiverChecking(false);
    }
    setWaiverOnFile(null);
    setWaiverId(null);
    setStep(4);
  };

  const handleLegalSubmit = async (legal: LegalAgreementData) => {
    setWaiverSubmitting(true);
    try {
      const { id } = await submitVisitorWaiver({
        legal,
        signerFirstName: form.parent_first,
        signerLastName: form.parent_last,
        signerEmail: form.parent_email,
        signerPhone: form.parent_phone || null,
        swimmers: [
          {
            first_name: form.child_first.trim(),
            last_name: form.child_last.trim(),
            dob: childDob,
          },
        ],
        source: "public",
      });
      setWaiverId(id);
      toast.success("Waiver signed");
      setStep(5);
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || "Could not save waiver");
    } finally {
      setWaiverSubmitting(false);
    }
  };

  const handleFinalize = () => {
    if (!plan || !slot || !canContinueStep3 || !canContinueStep5 || !waiverId) {
      toast.error("Please complete all fields");
      return;
    }
    setStep(7);
  };

  const [charges, setCharges] = useState<{ firstChargeCents: number; monthlyCents: number } | null>(
    null,
  );

  type MembershipQuote = {
    monthlyCents: number;
    firstChargeCents: number;
    firstLessonLabel: string;
    billingStartLabel: string;
    lessonsCovered: number;
    refMonthName: string;
  };
  const [quote, setQuote] = useState<MembershipQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    if (!plan || !slot) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    supabase.functions
      .invoke("get-membership-quote", {
        body: { plan_key: plan.plan_key, standing_slot_id: slot.id },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data || data.error) {
          setQuote(null);
        } else {
          setQuote({
            monthlyCents: data.monthlyCents ?? plan.monthly_price_cents,
            firstChargeCents: data.firstChargeCents ?? 0,
            firstLessonLabel: data.firstLessonLabel ?? "",
            billingStartLabel: data.billingStartLabel ?? "",
            lessonsCovered: data.lessonsCovered ?? 0,
            refMonthName: data.refMonthName ?? "",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plan, slot]);


  const fetchClientSecret = useCallback(async (): Promise<string> => {
    if (!plan || !slot) throw new Error("Missing plan or slot");
    const { data, error } = await supabase.functions.invoke("create-membership-checkout", {
      body: {
        plan_key: plan.plan_key,
        standing_slot_id: slot.id,
        child_first_name: form.child_first,
        child_last_name: form.child_last,
        child_dob: childDob,
        swim_level: plan.plan_key === "kid_group" ? swimLevel : null,
        parent_first_name: form.parent_first,
        parent_last_name: form.parent_last,
        parent_name: `${form.parent_first} ${form.parent_last}`.trim(),
        parent_email: form.parent_email,
        parent_phone: form.parent_phone,
        is_first_time: form.is_first_time === "yes",
        has_medical: form.has_medical === "yes",
        medical_notes: form.medical_notes,
        notes: form.notes,
        waiver_id: waiverId,
        recurring_consent: authRecurring,
        sms_consent: smsConsent,
        sms_consent_text: smsConsent ? SMS_CONSENT_DISCLOSURE : null,
        sms_consent_version: smsConsent ? SMS_CONSENT_VERSION : null,
        recurring_consent_version: MEMBERSHIP_AGREEMENT_VERSION,
        membership_agreement_version: MEMBERSHIP_AGREEMENT_VERSION,
        membership_agreement_text: MEMBERSHIP_AGREEMENT_TEXT,
        membership_agreement_accepted: agreementAccepted,
        returnUrl: `${window.location.origin}/join?membership=success&session_id={CHECKOUT_SESSION_ID}${holdToken ? `&hold=${encodeURIComponent(holdToken)}` : ""}`,
        environment: getStripeEnvironment(),
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
  }, [plan, slot, form, authRecurring, smsConsent, swimLevel, childDob, waiverId, holdToken]);

  const [returned, setReturned] = useState(false);
  const [returnFinalizing, setReturnFinalizing] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [manageToken, setManageToken] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("membership") === "success") {
      setReturned(true);
      setStep(8);
      const sessionId = p.get("session_id");
      if (!sessionId) {
        setReturnError("Missing checkout session. Please contact us so we can confirm your membership.");
        return;
      }
      setReturnFinalizing(true);
      supabase.functions
        .invoke("confirm-membership-checkout", {
          body: { sessionId, environment: getStripeEnvironment() },
        })
        .then(({ data, error }) => {
          if (error || !data?.success) {
            throw new Error(error?.message || data?.error || "Could not confirm membership");
          }
          setCharges({
            firstChargeCents: data.firstChargeCents ?? 0,
            monthlyCents: data.monthlyCents ?? 0,
          });
          setManageToken((data.manageToken as string | null) ?? null);
          setReturnError(null);
          const returningHold = p.get("hold");
          if (returningHold) {
            void supabase.functions.invoke("get-membership-hold", {
              body: { token: returningHold, action: "convert" },
            });
          }
        })
        .catch((error) => {
          setReturnError(error instanceof Error ? error.message : "Could not confirm membership");
        })
        .finally(() => setReturnFinalizing(false));
    }
  }, []);

  // Phone-booked hold: /join?hold=<token> skips program and slot selection.
  useEffect(() => {
    const token = holdTokenFromUrl();
    if (!token) return;
    (async () => {
      const { data, error } = await supabase.functions.invoke("get-membership-hold", {
        body: { token },
      });
      if (error || !data?.hold || !data?.plan || !data?.slot) {
        setHoldState("not_found");
        return;
      }
      const h = data.hold as {
        status: string;
        planKey: PlanKey;
        swimLevel: SwimLevel | null;
        swimmerName: string;
        parentName: string;
        parentPhone: string;
        parentEmail: string | null;
        existingWaiverId: string | null;
        heldUntil: string | null;
      };
      if (h.status !== "held") {
        setHoldState(
          h.status === "converted"
            ? "converted"
            : h.status === "cancelled"
            ? "cancelled"
            : h.status === "expired"
            ? "expired"
            : "not_found",
        );
        return;
      }
      const planRow = data.plan as Plan;
      const s = data.slot as Omit<Slot, "plan_id" | "plan_name" | "monthly_price_cents" | "spots_left">;
      setPlan(planRow);
      setSlot({
        ...s,
        plan_id: planRow.id,
        plan_name: planRow.name,
        monthly_price_cents: planRow.monthly_price_cents,
        spots_left: 1,
      } as Slot);
      // Small Group: only a level captured on the hold itself counts. A null
      // level means "not yet known", so the parent takes the assessment.
      const level =
        h.swimLevel ?? (planRow.plan_key === "kid_group" ? null : s.swim_level ?? null);
      setSwimLevel(level);
      // A waiver id on the hold means the front desk matched a waiver already
      // on file. Null means "not yet known" — the normal check still runs.
      if (h.existingWaiverId) {
        setHoldWaiverId(h.existingWaiverId);
        setWaiverId(h.existingWaiverId);
      }
      const [swimFirst, ...swimRest] = (h.swimmerName || "").trim().split(/\s+/);
      const [parentFirst, ...parentRest] = (h.parentName || "").trim().split(/\s+/);
      setHoldSwimmerFirst(swimFirst || "");
      setHoldHeldUntil(h.heldUntil ?? null);
      setForm((f) => ({
        ...f,
        child_first: swimFirst || "",
        child_last: swimRest.join(" "),
        parent_first: parentFirst || "",
        parent_last: parentRest.join(" "),
        parent_email: h.parentEmail || "",
        parent_phone: h.parentPhone || "",
      }));
      if (planRow.plan_key === "kid_group" && !level) {
        setShowAssessment(true);
        setStep(1);
      } else {
        setShowAssessment(false);
        setStep(3);
      }
      setHoldState("ok");

    })();
  }, []);

  // Back button must never drop a held parent into program selection.
  useEffect(() => {
    const onPop = () => {
      if (holdTokenFromUrl() && holdState === "ok") {
        setStep((s) => (s < 3 ? 3 : s));
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [holdState]);

  const heldUntilLabel = fmtHeldUntil(holdHeldUntil);




  const holdShell = (children: ReactNode) => (
    <div className="min-h-screen bg-[#F7F3EE]">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-[#1a3a8a]">Join Aquatic Dreams</h1>
          <p className="mt-2 text-[#2a5e84]">Monthly swim membership. Cancel anytime.</p>
        </div>
        {children}
      </div>
    </div>
  );

  // Gate the first paint: with a hold token in the URL the program picker
  // must never render, not even for a frame.
  if (holdState === "loading") {
    return holdShell(
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#2a5e84]" />
        <p className="text-sm text-[#2a5e84]">Pulling up your reserved spot…</p>
      </Card>,
    );
  }

  if (
    holdState === "expired" ||
    holdState === "converted" ||
    holdState === "cancelled" ||
    holdState === "not_found"
  ) {
    const problem = HOLD_PROBLEMS[holdState];
    return holdShell(
      <Card className="p-6">
        <h2 className="mb-2 text-xl font-semibold text-[#1a3a8a]">{problem.title}</h2>
        <p className="mb-6 text-sm text-[#2a5e84]">{problem.body}</p>
        <Button
          type="button"
          onClick={startNormalEnrollment}
          className="bg-[#F58B76] text-white hover:bg-[#F58B76]/90"
        >
          Start a new enrollment
        </Button>
      </Card>,
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F3EE]">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-[#1a3a8a]">Join Aquatic Dreams</h1>
          <p className="mt-2 text-[#2a5e84]">Monthly swim membership. Cancel anytime.</p>
        </div>

        {holdActive && slot && plan && step < 8 && (
          <div className="mb-6 rounded-lg border border-[#2a5e84]/20 bg-white p-4 text-sm text-[#2a5e84]">
            <div className="font-semibold text-[#1a3a8a]">Your spot is reserved</div>
            <dl className="mt-2 space-y-1">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-[#2a5e84]/70">Program</dt>
                <dd className="text-[#1a3a8a]">{plan.name}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-[#2a5e84]/70">When</dt>
                <dd className="text-[#1a3a8a]">
                  {DAYS[slot.day_of_week]} at {fmtTime(slot.start_time)}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-[#2a5e84]/70">Instructor</dt>
                <dd className="text-[#1a3a8a]">{slot.instructor_name || "To be assigned"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-[#2a5e84]/70">Swimmer</dt>
                <dd className="text-[#1a3a8a]">{holdSwimmerFirst || form.child_first}</dd>
              </div>
              {heldUntilLabel && (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-[#2a5e84]/70">Held until</dt>
                  <dd className="text-[#1a3a8a]">{heldUntilLabel}</dd>
                </div>
              )}
            </dl>
            <button
              type="button"
              onClick={() => setShowReleaseConfirm(true)}
              className="mt-3 text-sm font-medium text-[#2a5e84] underline underline-offset-2 hover:text-[#1a3a8a]"
            >
              Need a different time?
            </button>
          </div>
        )}

        <Dialog open={showReleaseConfirm} onOpenChange={setShowReleaseConfirm}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[#1a3a8a]">Release this spot?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-[#2a5e84]">
              Continuing gives up the time we are holding for you, and someone else may take it. You
              will then be able to browse every open time and pick a new one.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowReleaseConfirm(false)}
                className="border-[#2a5e84]/30 text-[#1a3a8a]"
              >
                Keep my spot
              </Button>
              <Button
                type="button"
                onClick={releaseHoldAndContinue}
                disabled={releasingHold}
                className="bg-[#F58B76] text-white hover:bg-[#F58B76]/90"
              >
                {releasingHold ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Release and choose another time"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>




        <div className="mb-6 flex items-center justify-center gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <div
              key={n}
              className={`h-2 w-8 rounded-full ${
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
                              ? "Kids group class · group sizes no more than 3 · we'll match your swimmer to the right level"
                              : p.plan_key === "private"
                              ? "One-on-one coaching"
                              : "Adult group class · 2 adults max per group"}
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
                    resetFilters();
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
                    <Select
                      value={swimLevel ?? ""}
                      onValueChange={(v: SwimLevel) => {
                        resetFilters();
                        setSwimLevel(v);
                      }}
                    >
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

                {slotsLoading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-12 text-[#2a5e84]">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <p className="text-sm">Loading available times…</p>
                  </div>
                ) : slotsError ? (
                  <div className="py-8 text-center text-[#2a5e84]">
                    <p className="mb-3">Could not load open slots.</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={loadSlots}
                      className="border-[#2a5e84]/30 text-[#1a3a8a] hover:bg-[#2a5e84]/5"
                    >
                      Try again
                    </Button>
                  </div>
                ) : planSlots.length === 0 ? (
                  <p className="py-8 text-center text-[#2a5e84]">
                    {plan.plan_key === "kid_group" && swimLevel
                      ? `No open ${LEVEL_LABELS[swimLevel]} slots right now. Try a different level or check back soon.`
                      : "No open spots right now — check back soon"}
                  </p>
                ) : (
                  <>
                    {showFilterBar && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        <div className="min-w-[9rem] flex-1">
                          <Select value={filterDay} onValueChange={setFilterDay}>
                            <SelectTrigger className="h-9 w-full text-xs" aria-label="Filter by day">
                              <SelectValue placeholder="Day" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any day</SelectItem>
                              {dayOptions.map((d) => (
                                <SelectItem key={d} value={String(d)}>{DAYS[d]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="min-w-[9rem] flex-1">
                          <Select value={filterInstructor} onValueChange={setFilterInstructor}>
                            <SelectTrigger className="h-9 w-full text-xs" aria-label="Filter by instructor">
                              <SelectValue placeholder="Instructor" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any instructor</SelectItem>
                              {instructorOptions.map((n) => (
                                <SelectItem key={n} value={n}>Coach {n}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="min-w-[9rem] flex-1">
                          <Select value={filterTime} onValueChange={setFilterTime}>
                            <SelectTrigger className="h-9 w-full text-xs" aria-label="Filter by time of day">
                              <SelectValue placeholder="Time" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any time</SelectItem>
                              <SelectItem value="morning">Morning (before 12:00pm)</SelectItem>
                              <SelectItem value="afternoon">Afternoon (12:00–5:00pm)</SelectItem>
                              <SelectItem value="evening">Evening (5:00pm and later)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {visibleSlots.length === 0 ? (
                      <div className="py-8 text-center text-[#2a5e84]">
                        <p className="mb-3">No times match these filters</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={resetFilters}
                          className="border-[#2a5e84]/30 text-[#1a3a8a] hover:bg-[#2a5e84]/5"
                        >
                          Clear filters
                        </Button>
                      </div>
                    ) : (
                      <>
                        <p className="mb-3 text-sm text-[#2a5e84]">
                          {visibleSlots.length} time{visibleSlots.length === 1 ? "" : "s"} available
                        </p>
                        <div className="space-y-5">
                          {groupedSlots.map(({ day, list }) => (
                            <div key={day}>
                              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[#1a3a8a]">
                                {DAYS[day]}
                              </h3>
                              <div className="space-y-2">
                                {list.map((s) => {
                                  const full = s.is_full ?? s.spots_left <= 0;
                                  const header = (
                                    <div>
                                      <div className="font-semibold text-[#1a3a8a]">
                                        {DAYS[s.day_of_week]} {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                                      </div>
                                      {s.instructor_name && (
                                        <div className="text-sm text-[#2a5e84]">Coach {s.instructor_name}</div>
                                      )}
                                    </div>
                                  );
                                  if (full) {
                                    return (
                                      <div
                                        key={s.id}
                                        className="flex w-full items-center justify-between gap-3 rounded-lg border-2 border-dashed border-[#2a5e84]/25 bg-[#2a5e84]/5 p-4 text-left opacity-90"
                                      >
                                        {header}
                                        <div className="flex flex-col items-end gap-2">
                                          <span className="text-sm font-medium text-[#2a5e84]">Class full</span>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="border-[#F58B76] text-[#1a3a8a] hover:bg-[#F58B76]/10"
                                            onClick={() => {
                                              setWaitlistSaved(false);
                                              setWaitlistSlot(s);
                                            }}
                                          >
                                            Join waitlist
                                          </Button>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() => {
                                        setSlot(s);
                                        setStep(3);
                                      }}
                                      className="flex w-full items-center justify-between rounded-lg border-2 border-[#2a5e84]/20 p-4 text-left transition hover:border-[#F58B76] hover:bg-[#F58B76]/5"
                                    >
                                      {header}
                                      <div className="text-sm font-medium text-[#F58B76]">
                                        {s.spots_left} spot{s.spots_left === 1 ? "" : "s"} left
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}


              </>
            )}

            {step === 3 && plan && (
              <>
                {!holdToken && (
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="mb-4 flex items-center gap-1 text-sm text-[#2a5e84] hover:underline"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                )}

                <h2 className="mb-1 text-xl font-semibold text-[#1a3a8a]">
                  {isAdult ? "Your info" : "Swimmer & parent info"}
                </h2>
                <p className="mb-4 text-sm text-[#2a5e84]">
                  {isAdult
                    ? "Please use your full legal name."
                    : "Please use the swimmer's full legal name."}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>{isAdult ? "Your first name" : "Child first name"}</Label>
                    <Input
                      value={form.child_first}
                      onChange={(e) => setForm({ ...form, child_first: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{isAdult ? "Your last name" : "Child last name"}</Label>
                    <Input
                      value={form.child_last}
                      onChange={(e) => setForm({ ...form, child_last: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>{isAdult ? "Your date of birth" : "Swimmer date of birth"}</Label>
                    <Input
                      type="date"
                      value={childDob}
                      onChange={(e) => setChildDob(e.target.value)}
                      max={new Date().toISOString().slice(0, 10)}
                    />
                    {plan.plan_key === "kid_group" && !!childDob && (
                      <p className="mt-1 text-xs text-[#2a5e84]">
                        From your assessment. Edit if needed.
                      </p>
                    )}
                  </div>
                  {!isAdult && (
                    <>
                      <div>
                        <Label>Parent first name</Label>
                        <Input
                          value={form.parent_first}
                          onChange={(e) => setForm({ ...form, parent_first: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Parent last name</Label>
                        <Input
                          value={form.parent_last}
                          onChange={(e) => setForm({ ...form, parent_last: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <Label>{isAdult ? "Your email" : "Parent email"}</Label>
                    <Input
                      type="email"
                      value={form.parent_email}
                      onChange={(e) => setForm({ ...form, parent_email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{isAdult ? "Your phone" : "Parent phone"}</Label>
                    <Input
                      type="tel"
                      value={form.parent_phone}
                      onChange={(e) => setForm({ ...form, parent_phone: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>
                      {isAdult
                        ? "Is this your first time swimming with us?"
                        : "Have you enrolled with us before?"}
                    </Label>
                    <RadioGroup
                      value={form.is_first_time}
                      onValueChange={(v) => setForm({ ...form, is_first_time: v as "yes" | "no" })}
                      className="mt-2 flex gap-6"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="yes" id="ft-yes" />
                        <Label htmlFor="ft-yes" className="cursor-pointer font-normal">
                          {isAdult ? "Yes, first time" : "First time"}
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="no" id="ft-no" />
                        <Label htmlFor="ft-no" className="cursor-pointer font-normal">
                          {isAdult ? "No, I've swum here before" : "Returning family"}
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>
                      {isAdult
                        ? "Do you have any medical conditions or allergies we should know about?"
                        : "Any medical conditions, allergies, or accommodations?"}
                    </Label>
                    <RadioGroup
                      value={form.has_medical}
                      onValueChange={(v) => setForm({ ...form, has_medical: v as "yes" | "no" })}
                      className="mt-2 flex gap-6"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="no" id="med-no" />
                        <Label htmlFor="med-no" className="cursor-pointer font-normal">No</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="yes" id="med-yes" />
                        <Label htmlFor="med-yes" className="cursor-pointer font-normal">Yes</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  {form.has_medical === "yes" && (
                    <div className="sm:col-span-2">
                      <Label>Please describe</Label>
                      <Textarea
                        value={form.medical_notes}
                        onChange={(e) => setForm({ ...form, medical_notes: e.target.value })}
                        rows={3}
                      />
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <Label>Anything else we should know? (optional)</Label>
                    <Textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      rows={2}
                    />
                  </div>
                </div>
                <Button
                  className="mt-6 w-full bg-[#F58B76] hover:bg-[#F58B76]/90"
                  disabled={!canContinueStep3 || waiverChecking}
                  onClick={handleInfoContinue}
                >
                  {waiverChecking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking waiver…
                    </>
                  ) : (
                    "Continue"
                  )}
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
                <LegalAgreements
                  parentName={
                    isAdult
                      ? `${form.child_first} ${form.child_last}`.trim()
                      : `${form.parent_first} ${form.parent_last}`.trim()
                  }
                  childName={`${form.child_first} ${form.child_last}`.trim()}
                  signerFirstName={isAdult ? undefined : form.parent_first}
                  signerLastName={isAdult ? undefined : form.parent_last}
                  signerPhone={isAdult ? undefined : form.parent_phone}
                  signerLabel={isAdult ? undefined : "Same as parent information"}
                  signerRelationshipDefault="Parent/Guardian"
                  lockFieldsOnSameAsSigner={false}
                  onSubmit={handleLegalSubmit}
                  onBack={() => setStep(3)}
                  submitting={waiverSubmitting}
                  submitLabel="Sign & continue"
                  submittingLabel="Saving…"
                />
              </>
            )}

            {step === 5 && plan && (
              <>
                <button
                  type="button"
                  onClick={() => setStep(waiverOnFile ? 3 : 4)}
                  className="mb-4 flex items-center gap-1 text-sm text-[#2a5e84] hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <h2 className="mb-4 text-xl font-semibold text-[#1a3a8a]">Agreement & consent</h2>
                <ClosureScheduleNote
                  className="mb-4 rounded-lg border border-[#2a5e84]/20 bg-[#f7f3ee] p-3"
                  title="Upcoming closures"
                />

                {waiverOnFile && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#2a5e84]/20 bg-[#2a5e84]/5 p-3 text-sm text-[#1a3a8a]">
                    <ShieldCheck className="mt-0.5 h-4 w-4 text-[#2a5e84]" />
                    <span>
                      Liability waiver already on file for {form.child_first} — no need to sign again.
                    </span>
                  </div>
                )}
                <div className="mb-4 rounded-lg border border-[#2a5e84]/20 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-[#2a5e84]/10 pb-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1a3a8a]">
                      Membership Agreement
                    </h3>
                    {quote ? (
                      <div className="text-xs text-[#1a3a8a]/80">
                        <span className="font-semibold text-[#1a3a8a]">
                          Due today {fmtPrice(quote.firstChargeCents)}
                        </span>
                        {" · "}
                        <span>
                          then {fmtPrice(quote.monthlyCents)}/month starting{" "}
                          {quote.billingStartLabel}
                        </span>
                      </div>
                    ) : quoteLoading ? (
                      <span className="text-xs text-[#1a3a8a]/60">Calculating charges…</span>
                    ) : null}
                  </div>
                  <div className="max-h-72 overflow-y-auto whitespace-pre-line rounded border border-[#2a5e84]/10 bg-[#2a5e84]/5 p-3 text-xs leading-relaxed text-[#1a3a8a]">
                    {MEMBERSHIP_AGREEMENT_TEXT}
                  </div>
                </div>
                <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-lg border border-[#F58B76]/40 bg-[#F58B76]/5 p-3">
                  <Checkbox
                    checked={agreementAccepted}
                    onCheckedChange={(v) => setAgreementAccepted(v === true)}
                  />
                  <span className="text-sm font-medium text-[#1a3a8a]">
                    I have read and agree to the Membership Agreement and authorize the recurring
                    monthly charge.
                  </span>
                </label>
                <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-lg border border-[#2a5e84]/20 p-3">
                  <Checkbox
                    checked={authRecurring}
                    onCheckedChange={(v) => setAuthRecurring(v === true)}
                  />
                  <span className="text-sm text-[#1a3a8a]">
                    I authorize this recurring monthly charge of{" "}
                    {fmtPrice(quote?.monthlyCents ?? plan.monthly_price_cents)} on the 1st of each
                    month until I cancel.
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#2a5e84]/20 p-3">
                  <Checkbox
                    checked={smsConsent}
                    onCheckedChange={(v) => setSmsConsent(v === true)}
                  />
                  <span className="text-sm text-[#1a3a8a]">{SMS_CONSENT_DISCLOSURE}</span>
                </label>
                <Button
                  className="mt-6 w-full bg-[#F58B76] hover:bg-[#F58B76]/90"
                  disabled={!canContinueStep5}
                  onClick={() => setStep(6)}
                >
                  Continue
                </Button>
              </>
            )}

            {step === 6 && plan && slot && (
              <>
                <button
                  type="button"
                  onClick={() => setStep(5)}
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
                  <Row
                    label={isAdult ? "Name" : "Swimmer"}
                    value={`${form.child_first} ${form.child_last}`}
                  />
                  <Row label="Date of birth" value={childDob} />
                  {!isAdult && (
                    <Row label="Parent" value={`${form.parent_first} ${form.parent_last}`} />
                  )}
                  <Row label="Email" value={form.parent_email} />
                  <Row label="Phone" value={form.parent_phone} />
                  {form.has_medical === "yes" && (
                    <Row label="Medical" value={form.medical_notes} />
                  )}
                  <Row label="Waiver" value={waiverOnFile ? "On file" : "Signed today"} />
                  <div className="space-y-2 border-t border-[#2a5e84]/20 pt-3">
                    {quoteLoading && !quote && (
                      <div className="text-sm text-[#2a5e84]">Calculating your first charge…</div>
                    )}
                    {quote && (
                      <>
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-medium text-[#1a3a8a]">Due today</span>
                          <span className="text-lg font-bold text-[#F58B76]">
                            {fmtPrice(quote.firstChargeCents)}
                          </span>
                        </div>
                        {quote.firstChargeCents < quote.monthlyCents && quote.lessonsCovered > 0 && (
                          <p className="text-xs text-[#2a5e84]">
                            Prorated — covers {quote.lessonsCovered} {quote.refMonthName} lesson
                            {quote.lessonsCovered === 1 ? "" : "s"}; your first lesson is{" "}
                            {quote.firstLessonLabel}.
                          </p>
                        )}
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-medium text-[#1a3a8a]">Then</span>
                          <span className="text-lg font-bold text-[#F58B76]">
                            {fmtPrice(quote.monthlyCents)}/month
                          </span>
                        </div>
                        <p className="text-xs text-[#2a5e84]">
                          Automatically on the 1st, starting {quote.billingStartLabel}.
                        </p>
                      </>
                    )}
                    {!quote && !quoteLoading && (
                      <Row
                        label="Monthly price"
                        value={
                          <span className="text-lg font-bold text-[#F58B76]">
                            {fmtPrice(plan.monthly_price_cents)}/mo
                          </span>
                        }
                      />
                    )}
                  </div>

                </dl>
                <Button
                  className="mt-6 w-full bg-[#F58B76] hover:bg-[#F58B76]/90"
                  onClick={handleFinalize}
                >
                  <Check className="mr-2 h-4 w-4" /> Continue to secure payment
                </Button>
              </>
            )}

            {step === 7 && plan && slot && !returned && (
              <>
                <button
                  type="button"
                  onClick={() => setStep(6)}
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

            {step === 8 && (
              <div className="py-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F58B76]/15">
                  {returnFinalizing ? (
                    <Loader2 className="h-7 w-7 animate-spin text-[#F58B76]" />
                  ) : (
                    <Check className="h-7 w-7 text-[#F58B76]" />
                  )}
                </div>
                {returnFinalizing ? (
                  <>
                    <h2 className="mb-2 text-2xl font-semibold text-[#1a3a8a]">Finalizing enrollment…</h2>
                    <p className="text-[#2a5e84]">Please keep this page open while we confirm your membership.</p>
                  </>
                ) : returnError ? (
                  <>
                    <h2 className="mb-2 text-2xl font-semibold text-[#1a3a8a]">Payment saved</h2>
                    <p className="text-[#2a5e84]">
                      We saved your card, but could not finish the membership record automatically.
                    </p>
                    <p className="mt-2 break-words text-sm text-[#2a5e84]/80">{returnError}</p>
                  </>
                ) : (
                  <>
                    <h2 className="mb-2 text-2xl font-semibold text-[#1a3a8a]">You're enrolled!</h2>
                    <p className="text-[#2a5e84]">
                      {charges
                        ? `First payment of ${fmtPrice(charges.firstChargeCents)} today, then ${fmtPrice(charges.monthlyCents)}/month on the 1st.`
                        : "Your membership is confirmed. Watch your email for confirmation."}
                    </p>
                    <p className="mt-2 text-sm text-[#2a5e84]/80">
                      We'll send a welcome email with your first class details shortly.
                    </p>
                    {manageToken && (
                      <a
                        href={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/membership-calendar-ics?token=${encodeURIComponent(manageToken)}`}
                        className="mt-6 inline-flex items-center justify-center rounded-md bg-[#2a5e84] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a3a8a]"
                        download
                      >
                        Add this month's lessons to your calendar
                      </a>
                    )}
                    <ClosureScheduleNote
                      className="mx-auto mt-6 max-w-md rounded-lg border border-[#2a5e84]/20 bg-[#f7f3ee] p-4 text-left"
                      title="Upcoming closures"
                    />
                  </>
                )}
              </div>
            )}


          </Card>
        )}
      </div>

      <Dialog open={!!waitlistSlot} onOpenChange={(o) => { if (!o) closeWaitlist(); }}>
        <DialogContent className="max-w-md">
          {waitlistSaved ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#1a3a8a]">You're on our interest list</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-[#2a5e84]">
                We have not enrolled you and you have not been charged. We will contact you when a
                spot opens in this class or when we add another class. This is an interest list, not
                a numbered queue, so we cannot promise a place in line or an automatic offer.
              </p>
              <div className="flex justify-end">
                <Button type="button" onClick={closeWaitlist} className="bg-[#F58B76] hover:bg-[#F58B76]/90">
                  Done
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#1a3a8a]">Join the waitlist</DialogTitle>
              </DialogHeader>
              {waitlistSlot && (
                <p className="text-sm text-[#2a5e84]">
                  {plan?.name} · {DAYS[waitlistSlot.day_of_week]}{" "}
                  {fmtTime(waitlistSlot.start_time)}–{fmtTime(waitlistSlot.end_time)}
                  {plan?.plan_key === "kid_group" && swimLevel ? ` · ${LEVEL_LABELS[swimLevel]}` : ""}
                </p>
              )}
              <div className="grid gap-3">
                <div>
                  <Label>Swimmer name</Label>
                  <Input
                    value={waitlistForm.swimmer_name}
                    onChange={(e) => setWaitlistForm({ ...waitlistForm, swimmer_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Parent name</Label>
                  <Input
                    value={waitlistForm.parent_name}
                    onChange={(e) => setWaitlistForm({ ...waitlistForm, parent_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={waitlistForm.parent_email}
                    onChange={(e) => setWaitlistForm({ ...waitlistForm, parent_email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    type="tel"
                    value={waitlistForm.parent_phone}
                    onChange={(e) => setWaitlistForm({ ...waitlistForm, parent_phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Anything else? (optional)</Label>
                  <Textarea
                    rows={3}
                    value={waitlistForm.notes}
                    onChange={(e) => setWaitlistForm({ ...waitlistForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-[#2a5e84]">
                This only tells us you are interested. No enrollment, no charge, no place in line.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={closeWaitlist} disabled={waitlistSubmitting}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={submitWaitlist}
                  disabled={waitlistSubmitting}
                  className="bg-[#F58B76] hover:bg-[#F58B76]/90"
                >
                  {waitlistSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Submit
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
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
