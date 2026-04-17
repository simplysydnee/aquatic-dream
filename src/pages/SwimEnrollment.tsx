import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import SwimAssessment from "@/components/swim-enrollment/SwimAssessment";
import SessionPicker from "@/components/swim-enrollment/SessionPicker";
import EnrollmentForm, { EnrollmentFormData } from "@/components/swim-enrollment/EnrollmentForm";
import LegalAgreements, { LegalAgreementData } from "@/components/swim-enrollment/LegalAgreements";
import EnrollmentConfirmation from "@/components/swim-enrollment/EnrollmentConfirmation";
import EnrollmentCheckout from "@/components/swim-enrollment/EnrollmentCheckout";
import LessonRequestForm from "@/components/swim-enrollment/LessonRequestForm";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { SwimLevel, PRICING } from "@/components/swim-enrollment/types";
import { WAIVER_VERSION, TOS_VERSION, PRIVACY_POLICY_VERSION } from "@/components/swim-enrollment/legal-content";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type Step = "assess" | "session" | "info" | "legal" | "payment" | "done";

const ENROLLMENT_STORAGE_KEY = "swim_enrollment_state";

interface ChildEnrollment {
  level: SwimLevel;
  childAge: number;
  childDob: string;
  childName: string;
  sessionIds: string[];
  enrollmentData: EnrollmentFormData;
  legalData: LegalAgreementData;
  isFirstTime: boolean;
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
  const [sharedParent, setSharedParent] = useState<{ name: string; email: string; phone: string } | null>(null);
  const [sharedEmergency, setSharedEmergency] = useState<{ name: string; phone: string; relationship: string } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"group" | "request">(isRequest ? "request" : "group");
  const [isFirstTime, setIsFirstTime] = useState(true);
  const [totalDue, setTotalDue] = useState(0);
  const [enrollmentIds, setEnrollmentIds] = useState<string[]>([]);
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
          if (s.enrollmentIds) setEnrollmentIds(s.enrollmentIds);
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
      setSharedParent({ name: data.parentName, email: data.parentEmail, phone: data.parentPhone || "" });
    }

    setStep("legal");
  };

  const handleAddAnother = (legalData: LegalAgreementData) => {
    if (!level || sessionIds.length === 0 || !enrollmentData) return;

    // Save emergency contact for next sibling
    if (!sharedEmergency) {
      setSharedEmergency({
        name: legalData.emergencyContactName,
        phone: legalData.emergencyContactPhone,
        relationship: legalData.emergencyContactRelationship,
      });
    }

    const child: ChildEnrollment = {
      level,
      childAge,
      childDob,
      childName: enrollmentData.childName,
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
    if (!level || sessionIds.length === 0 || !enrollmentData) return;
    setSubmitting(true);

    // Save emergency contact
    if (!sharedEmergency) {
      setSharedEmergency({
        name: legalData.emergencyContactName,
        phone: legalData.emergencyContactPhone,
        relationship: legalData.emergencyContactRelationship,
      });
    }

    // Combine current child with all previously added children
    const currentChild: ChildEnrollment = {
      level,
      childAge,
      childDob,
      childName: enrollmentData.childName,
      sessionIds,
      enrollmentData,
      legalData,
      isFirstTime: enrollmentData.isFirstTime === "yes",
    };
    const allChildren = [...completedChildren, currentChild];

    // Gather all session IDs across all children
    const allSessionIds = allChildren.flatMap(c => c.sessionIds);
    const uniqueSessionIds = [...new Set(allSessionIds)];

    // Fetch all sessions
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

    // Check capacity for all sessions
    const { data: existingEnrollments } = await supabase
      .from("swim_enrollments")
      .select("session_id")
      .in("session_id", uniqueSessionIds)
      .in("status", ["pending", "confirmed", "enrolled"]);

    const countMap: Record<string, number> = {};
    existingEnrollments?.forEach(e => {
      if (e.session_id) countMap[e.session_id] = (countMap[e.session_id] || 0) + 1;
    });

    const fullSessions = sessions.filter(s => (countMap[s.id] || 0) >= s.max_students);
    if (fullSessions.length > 0) {
      toast({ title: "Session full", description: `${fullSessions.length} session(s) just filled up. Please go back and choose again.`, variant: "destructive" });
      setSubmitting(false);
      setStep("session");
      return;
    }

    // Registration fee: each first-time child pays their own $45
    // Build enrollment rows for ALL children
    const enrollmentRows = allChildren.flatMap(child => {
      return child.sessionIds.map((sid, i) => {
        const s = sessionMap[sid];
        // Charge reg fee once per first-time child (on their first session row)
        const chargeRegFee = child.isFirstTime && i === 0;
        const regFee = chargeRegFee ? PRICING.registrationFee : 0;
        // First-time: pay only reg fee now (session deferred to first lesson day)
        // Returning: pay full session price upfront
        const sessionPrice = s?.session_price ?? 280;
        const paymentAmount = child.isFirstTime ? regFee : sessionPrice;
        return {
          swim_level: child.level,
          session_id: sid,
          parent_name: child.enrollmentData.parentName,
          parent_email: child.enrollmentData.parentEmail,
          parent_phone: child.enrollmentData.parentPhone || null,
          child_name: child.enrollmentData.childName,
          child_age: child.childAge,
          child_dob: child.childDob || null,
          medical_notes: child.enrollmentData.hasMedical === "yes" ? (child.enrollmentData.medicalNotes || null) : null,
          notes: child.enrollmentData.notes || null,
          lesson_type: "group" as const,
          registration_fee: regFee,
          status: "confirmed" as const,
          payment_status: "unpaid" as const,
          payment_amount: paymentAmount,
          is_first_time: child.isFirstTime,
          payment_due_date: s?.session_start_date || null,
        };
      });
    });

    const { data: newEnrollments, error: enrollError } = await supabase
      .from("swim_enrollments")
      .insert(enrollmentRows)
      .select("id");

    if (enrollError || !newEnrollments || newEnrollments.length === 0) {
      toast({ title: "Something went wrong", description: "Please try again or contact us directly.", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    const newIds = newEnrollments.map(e => e.id);
    setEnrollmentIds(newIds);

    // Create legal agreements for each enrollment
    let signerIp: string | null = null;
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json");
      const ipData = await ipRes.json();
      signerIp = ipData.ip;
    } catch { /* best-effort */ }

    // Map enrollment IDs back to children
    let idx = 0;
    const agreementRows = allChildren.flatMap(child => {
      return child.sessionIds.map(() => {
        const enrollId = newIds[idx++];
        return {
          enrollment_id: enrollId,
          waiver_accepted: child.legalData.waiverAccepted,
          photo_release_accepted: child.legalData.photoReleaseAccepted === "yes",
          privacy_policy_accepted: child.legalData.privacyPolicyAccepted,
          terms_accepted: child.legalData.termsAccepted,
          signature_text: child.legalData.signatureText,
          signer_name: child.enrollmentData.parentName,
          signer_email: child.enrollmentData.parentEmail,
          signer_ip: signerIp,
          waiver_version: WAIVER_VERSION,
          tos_version: TOS_VERSION,
          privacy_policy_version: PRIVACY_POLICY_VERSION,
          emergency_contact_name: child.legalData.emergencyContactName,
          emergency_contact_phone: child.legalData.emergencyContactPhone,
          emergency_contact_relationship: child.legalData.emergencyContactRelationship,
        };
      });
    });

    const { error: legalError } = await supabase
      .from("enrollment_agreements")
      .insert(agreementRows);

    setSubmitting(false);
    if (legalError) {
      toast({ title: "Something went wrong", description: "Please try again or contact us directly.", variant: "destructive" });
      return;
    }

    // Calculate total due
    const total = enrollmentRows.reduce((sum, r) => sum + r.payment_amount, 0);
    setTotalDue(total);
    setConfirmedChildren(allChildren);

    // Save state for Stripe redirect
    try {
      localStorage.setItem(ENROLLMENT_STORAGE_KEY, JSON.stringify({
        confirmedChildren: allChildren,
        totalDue: total,
        enrollmentIds: newIds,
      }));
    } catch { /* ignore */ }

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
            <p className="text-primary font-medium tracking-wider uppercase text-sm mb-2">Lesson Request</p>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
              Request a Private or Semi-Private Lesson
            </h1>
          </div>
        </section>
        <div className="container py-6 pb-16">
          <div className="flex gap-2 mb-8">
            <Button variant="outline" size="sm" onClick={() => setMode("group")}>Group Enrollment</Button>
            <Button variant="default" size="sm" onClick={() => setMode("request")}>Private / Semi-Private</Button>
          </div>
          <LessonRequestForm />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
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
              defaultParentName={sharedParent?.name}
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
              defaultEmergencyContactName={sharedEmergency?.name}
              defaultEmergencyContactPhone={sharedEmergency?.phone}
              defaultEmergencyContactRelationship={sharedEmergency?.relationship}
              showAddAnother={true}
              onAddAnother={handleAddAnother}
            />
          )}
          {step === "payment" && enrollmentIds.length > 0 && (
            <EnrollmentCheckout
              priceIds={getCheckoutPriceIds()}
              customerEmail={confirmedChildren[0]?.enrollmentData?.parentEmail || enrollmentData?.parentEmail || ""}
              enrollmentId={enrollmentIds[0]}
              onBack={() => setStep("legal")}
            />
          )}
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
