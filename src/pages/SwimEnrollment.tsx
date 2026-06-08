import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import SEO from "@/components/SEO";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import SwimAssessment from "@/components/swim-enrollment/SwimAssessment";
import SessionPicker from "@/components/swim-enrollment/SessionPicker";
import EnrollmentForm, { EnrollmentFormData } from "@/components/swim-enrollment/EnrollmentForm";
import LegalAgreements, { LegalAgreementData } from "@/components/swim-enrollment/LegalAgreements";
import EnrollmentConfirmation from "@/components/swim-enrollment/EnrollmentConfirmation";
import EnrollmentCheckout from "@/components/swim-enrollment/EnrollmentCheckout";
import SessionFullFallback from "@/components/swim-enrollment/SessionFullFallback";
import LessonRequestForm from "@/components/swim-enrollment/LessonRequestForm";
import PrivateBookingFlow from "@/components/private-lessons/PrivateBookingFlow";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { SwimLevel, PRICING } from "@/components/swim-enrollment/types";
import { WAIVER_VERSION, TOS_VERSION, PRIVACY_POLICY_VERSION } from "@/components/swim-enrollment/legal-content";
import { lookupActiveWaiver, legalDataFromWaiver, backfillVisitorWaiver, type ActiveWaiver } from "@/lib/swimmerWaiver";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type Step = "assess" | "session" | "info" | "legal" | "payment" | "full" | "done";

const ENROLLMENT_STORAGE_KEY = "swim_enrollment_state";

interface ChildEnrollment {
  level: SwimLevel;
  childAge: number;
  childDob: string;
  childName: string;
  childFirstName: string;
  childLastName: string;
  sessionIds: string[];
  enrollmentData: EnrollmentFormData;
  legalData: LegalAgreementData;
  isFirstTime: boolean;
  /** First-timers only: pay full session fee at checkout (default false). */
  payAhead?: boolean;
}

const SwimEnrollment = () => {
  const [searchParams] = useSearchParams();
  const isRequest = searchParams.get("type") === "request";
  const isDone = searchParams.get("step") === "done";

  const [step, setStep] = useState<Step>(isDone ? "done" : "assess");
  // Current child being enrolled (in-progress state)
  const [level, setLevel] = useState<SwimLevel | null>(null);
  const [childAge, setChildAge] = useState(0);
  const [childDob, setChildDob] = useState("");
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [enrollmentData, setEnrollmentData] = useState<EnrollmentFormData | null>(null);

  // Multi-child state
  const [completedChildren, setCompletedChildren] = useState<ChildEnrollment[]>([]);
  const [sharedParent, setSharedParent] = useState<{ firstName: string; lastName: string; email: string; phone: string } | null>(null);
  const [sharedEmergency, setSharedEmergency] = useState<{ firstName: string; lastName: string; phone: string; relationship: string } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"group" | "request">(isRequest ? "request" : "group");
  const [isFirstTime, setIsFirstTime] = useState(true);
  const [totalDue, setTotalDue] = useState(0);
  // Inputs needed to build the create-checkout payload (no DB row yet)
  const [checkoutInputs, setCheckoutInputs] = useState<{
    children: ChildEnrollment[];
    signerIp: string | null;
    sessionPrices: Record<string, number>;
  } | null>(null);
  // For confirmation: all children info
  const [confirmedChildren, setConfirmedChildren] = useState<ChildEnrollment[]>([]);
  const { toast } = useToast();

  const allSteps = ["Assessment", "Session", "Details", "Agreements", "Payment", "Confirmed"];
  const stepKeys = ["assess", "session", "info", "legal", "payment", "done"];
  const stepIndex = stepKeys.indexOf(step);

  // Restore state from localStorage when returning from Stripe
  useEffect(() => {
    if (isDone) {
      try {
        const saved = localStorage.getItem(ENROLLMENT_STORAGE_KEY);
        if (saved) {
          const s = JSON.parse(saved);
          if (s.confirmedChildren) setConfirmedChildren(s.confirmedChildren);
          if (s.totalDue) setTotalDue(s.totalDue);
          localStorage.removeItem(ENROLLMENT_STORAGE_KEY);
        }
      } catch { /* ignore */ }
    }
  }, [isDone]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const handleAssessmentComplete = (recommendedLevel: SwimLevel, age: number, dob: string) => {
    setLevel(recommendedLevel);
    setChildAge(age);
    setChildDob(dob);
    setStep("session");
  };

  const handleSessionSelect = (ids: string[]) => {
    setSessionIds(ids);
    setStep("info");
  };

  const handleInfoSubmit = async (data: EnrollmentFormData) => {
    setEnrollmentData(data);

    const firstTime = data.isFirstTime === "yes";
    setIsFirstTime(firstTime);

    // Save shared parent info for sibling pre-fill
    if (!sharedParent) {
      setSharedParent({
        firstName: data.parentFirstName,
        lastName: data.parentLastName,
        email: data.parentEmail,
        phone: data.parentPhone || "",
      });
    }

    // Check for an existing active waiver (name + DOB, within last 12 months).
    // If found, skip the legal step entirely and use the stored signature.
    if (data.childFirstName && data.childLastName && childDob) {
      try {
        const existing = await lookupActiveWaiver(data.childFirstName, data.childLastName, childDob);
        if (existing) {
          toast({
            title: "Waiver already on file",
            description: `Using ${data.childFirstName}'s signed waiver — skipping the legal step.`,
          });
          const legal = legalDataFromWaiver(existing);
          await proceedToPayment(data, legal, { skipBackfill: true });
          return;
        }
      } catch (e) {
        console.warn("waiver lookup failed", e);
      }
    }

    setStep("legal");
  };

  const handleAddAnother = (legalData: LegalAgreementData) => {
    if (!level || sessionIds.length === 0 || !enrollmentData) return;

    // Save emergency contact for next sibling
    if (!sharedEmergency) {
      setSharedEmergency({
        firstName: legalData.emergencyContactFirstName,
        lastName: legalData.emergencyContactLastName,
        phone: legalData.emergencyContactPhone,
        relationship: legalData.emergencyContactRelationship,
      });
    }

    // Best-effort backfill so this child is auto-detected next time
    backfillVisitorWaiver({
      legal: legalData,
      signerEmail: enrollmentData.parentEmail,
      child: {
        firstName: enrollmentData.childFirstName,
        lastName: enrollmentData.childLastName,
        dob: childDob,
      },
    });

    const child: ChildEnrollment = {
      level,
      childAge,
      childDob,
      childName: enrollmentData.childName,
      childFirstName: enrollmentData.childFirstName,
      childLastName: enrollmentData.childLastName,
      sessionIds,
      enrollmentData,
      legalData,
      isFirstTime: enrollmentData.isFirstTime === "yes",
    };
    setCompletedChildren(prev => [...prev, child]);

    // Reset per-child state and go back to assessment
    setLevel(null);
    setChildAge(0);
    setChildDob("");
    setSessionIds([]);
    setEnrollmentData(null);
    setStep("assess");

    toast({ title: `${child.childName} added!`, description: "Now add the next swimmer." });
  };

  const handleLegalSubmit = async (legalData: LegalAgreementData) => {
    if (!enrollmentData) return;
    await proceedToPayment(enrollmentData, legalData);
  };

  const proceedToPayment = async (
    enrollmentDataArg: EnrollmentFormData,
    legalData: LegalAgreementData,
    opts: { skipBackfill?: boolean } = {},
  ) => {
    if (!level || sessionIds.length === 0) return;
    setSubmitting(true);

    // Save emergency contact
    if (!sharedEmergency) {
      setSharedEmergency({
        firstName: legalData.emergencyContactFirstName,
        lastName: legalData.emergencyContactLastName,
        phone: legalData.emergencyContactPhone,
        relationship: legalData.emergencyContactRelationship,
      });
    }

    // Combine current child with all previously added children
    const currentChild: ChildEnrollment = {
      level,
      childAge,
      childDob,
      childName: enrollmentDataArg.childName,
      childFirstName: enrollmentDataArg.childFirstName,
      childLastName: enrollmentDataArg.childLastName,
      sessionIds,
      enrollmentData: enrollmentDataArg,
      legalData,
      isFirstTime: enrollmentDataArg.isFirstTime === "yes",
    };
    const allChildren = [...completedChildren, currentChild];

    // Gather all session IDs across all children
    const allSessionIds = allChildren.flatMap(c => c.sessionIds);
    const uniqueSessionIds = [...new Set(allSessionIds)];

    // Fetch sessions for capacity check + price/total calculation
    const { data: sessions } = await supabase
      .from("swim_sessions")
      .select("id, max_students, session_price, session_start_date")
      .in("id", uniqueSessionIds);

    if (!sessions || sessions.length === 0) {
      toast({ title: "Something went wrong", description: "Could not find selected sessions.", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    const sessionMap = Object.fromEntries(sessions.map(s => [s.id, s]));

    // Capacity check — only count paid/active rows. Public RPC returns aggregates only.
    const { data: existingEnrollments } = await supabase.rpc("get_session_enrollment_counts", {
      _session_ids: uniqueSessionIds,
    } as any);

    const countMap: Record<string, number> = {};
    (existingEnrollments as any[] | null)?.forEach((e) => {
      if (e?.session_id) countMap[e.session_id] = e.enrolled_count || 0;
    });

    const fullSessions = sessions.filter(s => (countMap[s.id] || 0) >= s.max_students);
    if (fullSessions.length > 0) {
      // Stash the in-progress child so the fallback screen can pre-fill the waitlist.
      setConfirmedChildren(allChildren);
      setSubmitting(false);
      setStep("full");
      return;
    }

    // Backfill waiver for this child (skip if we already reused a stored one)
    if (!opts.skipBackfill) {
      backfillVisitorWaiver({
        legal: legalData,
        signerEmail: enrollmentDataArg.parentEmail,
        child: {
          firstName: enrollmentDataArg.childFirstName,
          lastName: enrollmentDataArg.childLastName,
          dob: childDob,
        },
      });
    }

    // Calculate "today" total for display purposes — assumes payAhead=false
    // (i.e. just reg fees for first-timers). The user can opt to pay ahead in
    // the next step; that updates the Stripe-side total. The server is
    // authoritative for the actual charge.
    const total = allChildren.reduce((sum, child) => {
      return sum + child.sessionIds.reduce((cs, sid, i) => {
        const s = sessionMap[sid];
        const sessionPrice = s?.session_price ?? 240;
        if (child.isFirstTime) {
          return cs + (i === 0 ? PRICING.registrationFee : 0);
        }
        return cs + sessionPrice;
      }, 0);
    }, 0);

    const sessionPrices: Record<string, number> = {};
    for (const s of sessions) sessionPrices[s.id] = Number(s.session_price ?? 240);

    setCheckoutInputs({ children: allChildren, signerIp: null, sessionPrices });
    setTotalDue(total);
    setConfirmedChildren(allChildren);

    // Save state for Stripe redirect (no enrollmentIds — they don't exist yet)
    try {
      localStorage.setItem(ENROLLMENT_STORAGE_KEY, JSON.stringify({
        confirmedChildren: allChildren,
        totalDue: total,
      }));
    } catch { /* ignore */ }

    setSubmitting(false);
    setStep("payment");
  };



  // Count of swimmers added so far (for the progress indicator)
  const swimmerCount = completedChildren.length + 1;

  if (mode === "request") {
    return (
      <main className="min-h-screen bg-background">
        <PaymentTestModeBanner />
        <section className="bg-gradient-to-br from-primary/10 to-background py-12">
          <div className="container">
            <p className="text-primary font-medium tracking-wider uppercase text-sm mb-2">Private & Semi-Private</p>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
              Book a Private Lesson or Request Semi-Private
            </h1>
          </div>
        </section>
        <div className="container py-6 pb-16">
          <div className="flex gap-2 mb-8 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setMode("group")}>Group Enrollment</Button>
            <Button variant="default" size="sm" onClick={() => setMode("request")}>Private / Semi-Private</Button>
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="border border-border rounded-xl p-6 bg-card">
              <h2 className="font-display text-xl font-bold mb-1">Private lessons</h2>
              <p className="text-sm text-muted-foreground mb-6">Book online. Pick your instructor, days and times, and save a card on file. $65 charged on the day of each lesson.</p>
              <PrivateBookingFlow />
            </div>
            <div className="border border-border rounded-xl p-6 bg-card">
              <h2 className="font-display text-xl font-bold mb-1">Semi-private (2 swimmers)</h2>
              <p className="text-sm text-muted-foreground mb-6">Send us a quick request and we'll match you with a partner and schedule your lessons manually.</p>
              <LessonRequestForm />
            </div>
          </div>
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-background">
      <SEO
        title="Enroll in Swim Lessons — Aquatic Dreams Swim Modesto"
        description="Enroll your swimmer at Aquatic Dreams in Modesto. Quick assessment, session pick, secure online checkout for group, semi-private, and private lessons."
        path="/swim-enrollment"
      />
      <PaymentTestModeBanner />
      <section className="bg-gradient-to-br from-primary/10 to-background py-12">
        <div className="container">
          <p className="text-primary font-medium tracking-wider uppercase text-sm mb-2">Swim Enrollment</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
            Enroll Your Swimmer{completedChildren.length > 0 ? "s" : ""}
          </h1>
          {completedChildren.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {completedChildren.map(c => c.childName).join(", ")} added — now enrolling swimmer #{swimmerCount}
            </p>
          )}
        </div>
      </section>

      <div className="container py-6">
        <div className="flex gap-2 mb-6">
          <Button variant="default" size="sm" onClick={() => setMode("group")}>Group Enrollment</Button>
          <Button variant="outline" size="sm" onClick={() => setMode("request")}>Private / Semi-Private</Button>
        </div>

        {/* Mobile progress */}
        <div className="sm:hidden mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-foreground">
              Step {stepIndex + 1}: {allSteps[stepIndex]}
            </span>
            <span className="text-xs text-muted-foreground">
              {stepIndex + 1} of {allSteps.length}
            </span>
          </div>
          <Progress value={((stepIndex + 1) / allSteps.length) * 100} className="h-2" />
        </div>

        {/* Desktop step circles */}
        <div className="hidden sm:flex items-center justify-center gap-2 max-w-xl mx-auto mb-8">
          {allSteps.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${i <= stepIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {i + 1}
                </div>
                <span className="text-xs text-muted-foreground mt-1">{label}</span>
              </div>
              {i < allSteps.length - 1 && (
                <div className={`h-0.5 flex-1 -mt-6 ${i < stepIndex ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="pb-16">
          {step === "assess" && <SwimAssessment onComplete={handleAssessmentComplete} />}
          {step === "session" && level && (
            <SessionPicker level={level} childAge={childAge} onSelect={handleSessionSelect} onBack={() => setStep("assess")} />
          )}
          {step === "info" && (
            <EnrollmentForm
              onSubmit={handleInfoSubmit}
              onBack={() => setStep("session")}
              submitting={false}
              defaultParentFirstName={sharedParent?.firstName}
              defaultParentLastName={sharedParent?.lastName}
              defaultParentEmail={sharedParent?.email}
              defaultParentPhone={sharedParent?.phone}
            />
          )}
          {step === "legal" && enrollmentData && (
            <LegalAgreements
              parentName={enrollmentData.parentName}
              childName={enrollmentData.childName}
              onSubmit={handleLegalSubmit}
              onBack={() => setStep("info")}
              submitting={submitting}
              defaultEmergencyContactFirstName={sharedEmergency?.firstName}
              defaultEmergencyContactLastName={sharedEmergency?.lastName}
              defaultEmergencyContactPhone={sharedEmergency?.phone}
              defaultEmergencyContactRelationship={sharedEmergency?.relationship}
              showAddAnother={true}
              onAddAnother={handleAddAnother}
            />
          )}
          {step === "payment" && checkoutInputs && (() => {
            const inputs = checkoutInputs;
            const hasFirstTimers = inputs.children.some(c => c.isFirstTime);
            // Use the first first-timer's session_price (they're all $240 in practice).
            // Counted: number of session-fee charges if pay-ahead is selected
            // (one per first-timer × their session count).
            const firstTimerSessionIds = inputs.children
              .filter(c => c.isFirstTime)
              .flatMap(c => c.sessionIds);
            const sessionFeeCount = firstTimerSessionIds.length;
            const sessionFeeUsd = firstTimerSessionIds.length > 0
              ? (inputs.sessionPrices[firstTimerSessionIds[0]] ?? 240)
              : 240;

            return (
              <EnrollmentCheckout
                buildPayload={({ payAheadForFirstTimers }) => ({
                  children: inputs.children.map(child => ({
                    level: child.level,
                    childName: child.enrollmentData.childName,
                    childFirstName: child.enrollmentData.childFirstName,
                    childLastName: child.enrollmentData.childLastName,
                    childAge: child.childAge,
                    childDob: child.childDob || null,
                    sessionIds: child.sessionIds,
                    isFirstTime: child.isFirstTime,
                    payAhead: child.isFirstTime ? payAheadForFirstTimers : false,
                    parentName: child.enrollmentData.parentName,
                    parentFirstName: child.enrollmentData.parentFirstName,
                    parentLastName: child.enrollmentData.parentLastName,
                    parentEmail: child.enrollmentData.parentEmail,
                    parentPhone: child.enrollmentData.parentPhone || null,
                    smsConsent: !!child.enrollmentData.smsConsent,
                    medicalNotes: child.enrollmentData.hasMedical === "yes" ? (child.enrollmentData.medicalNotes || null) : null,
                    notes: child.enrollmentData.notes || null,
                    agreement: {
                      waiverAccepted: child.legalData.waiverAccepted,
                      photoReleaseAccepted: child.legalData.photoReleaseAccepted === "yes",
                      privacyPolicyAccepted: child.legalData.privacyPolicyAccepted,
                      termsAccepted: child.legalData.termsAccepted,
                      signatureText: child.legalData.signatureText,
                      emergencyContactName: child.legalData.emergencyContactName,
                      emergencyContactFirstName: child.legalData.emergencyContactFirstName,
                      emergencyContactLastName: child.legalData.emergencyContactLastName,
                      emergencyContactPhone: child.legalData.emergencyContactPhone,
                      emergencyContactRelationship: child.legalData.emergencyContactRelationship,
                    },
                  })),
                  signerIp: inputs.signerIp,
                  versions: { waiver: WAIVER_VERSION, tos: TOS_VERSION, privacy: PRIVACY_POLICY_VERSION },
                })}
                customerEmail={confirmedChildren[0]?.enrollmentData?.parentEmail || enrollmentData?.parentEmail || ""}
                hasFirstTimers={hasFirstTimers}
                sessionFeeUsd={sessionFeeUsd}
                sessionFeeCount={sessionFeeCount}
                onBack={() => setStep("legal")}
                onSessionFull={() => setStep("full")}
              />
            );
          })()}
          {step === "full" && (() => {
            const child = confirmedChildren[0] ?? null;
            return (
              <SessionFullFallback
                swimLevel={(child?.level || level || "") as string}
                sessionId={child?.sessionIds?.[0] || sessionIds[0] || null}
                sessionLabel={null}
                parentFirstName={child?.enrollmentData?.parentFirstName || enrollmentData?.parentFirstName || ""}
                parentLastName={child?.enrollmentData?.parentLastName || enrollmentData?.parentLastName || ""}
                parentEmail={child?.enrollmentData?.parentEmail || enrollmentData?.parentEmail || ""}
                parentPhone={child?.enrollmentData?.parentPhone || enrollmentData?.parentPhone || null}
                childFirstName={child?.enrollmentData?.childFirstName || enrollmentData?.childFirstName || ""}
                childLastName={child?.enrollmentData?.childLastName || enrollmentData?.childLastName || ""}
                childAge={child?.childAge ?? childAge ?? null}
                onPickDifferentSession={() => setStep("session")}
              />
            );
          })()}
          {step === "done" && (
            <EnrollmentConfirmation
              children={confirmedChildren.length > 0 ? confirmedChildren.map(c => ({
                level: c.level,
                childName: c.childName,
                childAge: c.childAge,
                sessionIds: c.sessionIds,
                isFirstTime: c.isFirstTime,
              })) : undefined}
              level={confirmedChildren[0]?.level || level || "white"}
              childName={confirmedChildren[0]?.childName || ""}
              childAge={confirmedChildren[0]?.childAge || 0}
              sessionIds={confirmedChildren[0]?.sessionIds || []}
              isFirstTime={confirmedChildren.some(c => c.isFirstTime)}
              totalDue={totalDue}
            />
          )}
        </div>
      </div>
    </main>
  );
};

export default SwimEnrollment;
