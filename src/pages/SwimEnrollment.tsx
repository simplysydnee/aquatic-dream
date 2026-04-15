import { useState } from "react";
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

type Step = "assess" | "session" | "info" | "legal" | "payment" | "done";

const SwimEnrollment = () => {
  const [searchParams] = useSearchParams();
  const isRequest = searchParams.get("type") === "request";
  const initialStep = searchParams.get("step") === "done" ? "done" : "assess";

  const [step, setStep] = useState<Step>(initialStep as Step);
  const [level, setLevel] = useState<SwimLevel | null>(null);
  const [childAge, setChildAge] = useState(0);
  const [childDob, setChildDob] = useState("");
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [childName, setChildName] = useState("");
  const [enrollmentData, setEnrollmentData] = useState<EnrollmentFormData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"group" | "request">(isRequest ? "request" : "group");
  const [isFirstTime, setIsFirstTime] = useState(true);
  const [totalDue, setTotalDue] = useState(0);
  const [enrollmentIds, setEnrollmentIds] = useState<string[]>([]);
  const { toast } = useToast();

  const allSteps = isFirstTime
    ? ["Assessment", "Session", "Details", "Agreements", "Confirmed"]
    : ["Assessment", "Session", "Details", "Agreements", "Payment", "Confirmed"];

  const stepKeys = isFirstTime
    ? ["assess", "session", "info", "legal", "done"]
    : ["assess", "session", "info", "legal", "payment", "done"];

  const stepIndex = stepKeys.indexOf(step);

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
    setChildName(data.childName);

    const firstTime = data.isFirstTime === "yes";
    setIsFirstTime(firstTime);

    if (sessionIds.length > 0) {
      const { data: sessions } = await supabase
        .from("swim_sessions")
        .select("id, session_price")
        .in("id", sessionIds);
      const totalSessionFees = sessions?.reduce((sum, s) => sum + (s.session_price ?? 280), 0) ?? 280 * sessionIds.length;
      const regFee = firstTime ? PRICING.registrationFee : 0;
      setTotalDue(totalSessionFees + regFee);
    }

    setStep("legal");
  };

  const handleLegalSubmit = async (legalData: LegalAgreementData) => {
    if (!level || sessionIds.length === 0 || !enrollmentData) return;
    setSubmitting(true);

    // Fetch all selected sessions
    const { data: sessions } = await supabase
      .from("swim_sessions")
      .select("id, max_students, session_price, session_start_date")
      .in("id", sessionIds);

    if (!sessions || sessions.length === 0) {
      toast({ title: "Something went wrong", description: "Could not find selected sessions.", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Check capacity for all sessions
    const { data: enrollments } = await supabase
      .from("swim_enrollments")
      .select("session_id")
      .in("session_id", sessionIds)
      .in("status", ["pending", "confirmed"]);

    const countMap: Record<string, number> = {};
    enrollments?.forEach(e => {
      if (e.session_id) countMap[e.session_id] = (countMap[e.session_id] || 0) + 1;
    });

    const fullSessions = sessions.filter(s => (countMap[s.id] || 0) >= s.max_students);
    if (fullSessions.length > 0) {
      toast({ title: "Session full", description: `${fullSessions.length} session(s) just filled up. Please go back and choose again.`, variant: "destructive" });
      setSubmitting(false);
      setStep("session");
      return;
    }

    // Registration fee only on the first enrollment
    const regFee = isFirstTime ? PRICING.registrationFee : 0;

    // Create enrollments for all selected sessions
    const enrollmentRows = sessions.map((s, i) => ({
      swim_level: level,
      session_id: s.id,
      parent_name: enrollmentData.parentName,
      parent_email: enrollmentData.parentEmail,
      parent_phone: enrollmentData.parentPhone || null,
      child_name: enrollmentData.childName,
      child_age: childAge,
      child_dob: childDob || null,
      medical_notes: enrollmentData.hasMedical === "yes" ? (enrollmentData.medicalNotes || null) : null,
      notes: enrollmentData.notes || null,
      lesson_type: "group" as const,
      registration_fee: i === 0 ? regFee : 0, // reg fee only on first
      status: "confirmed" as const,
      payment_status: "unpaid" as const,
      payment_amount: (s.session_price ?? 280) + (i === 0 ? regFee : 0),
      is_first_time: isFirstTime,
      payment_due_date: s.session_start_date || null,
    }));

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

    const agreementRows = newIds.map(enrollId => ({
      enrollment_id: enrollId,
      waiver_accepted: legalData.waiverAccepted,
      photo_release_accepted: legalData.photoReleaseAccepted,
      privacy_policy_accepted: legalData.privacyPolicyAccepted,
      terms_accepted: legalData.termsAccepted,
      signature_text: legalData.signatureText,
      signer_name: enrollmentData.parentName,
      signer_email: enrollmentData.parentEmail,
      signer_ip: signerIp,
      waiver_version: WAIVER_VERSION,
      tos_version: TOS_VERSION,
      privacy_policy_version: PRIVACY_POLICY_VERSION,
      emergency_contact_name: legalData.emergencyContactName,
      emergency_contact_phone: legalData.emergencyContactPhone,
      emergency_contact_relationship: legalData.emergencyContactRelationship,
    }));

    const { error: legalError } = await supabase
      .from("enrollment_agreements")
      .insert(agreementRows);

    setSubmitting(false);
    if (legalError) {
      toast({ title: "Something went wrong", description: "Please try again or contact us directly.", variant: "destructive" });
      return;
    }

    if (!isFirstTime) {
      setStep("payment");
    } else {
      setStep("done");
    }
  };

  const getCheckoutPriceIds = (): string[] => {
    const ids: string[] = [];
    for (let i = 0; i < sessionIds.length; i++) {
      ids.push("swim_session_fee");
    }
    if (isFirstTime) ids.push("registration_fee");
    return ids;
  };

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
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">Enroll Your Swimmer</h1>
        </div>
      </section>

      <div className="container py-6">
        <div className="flex gap-2 mb-6">
          <Button variant="default" size="sm" onClick={() => setMode("group")}>Group Enrollment</Button>
          <Button variant="outline" size="sm" onClick={() => setMode("request")}>Private / Semi-Private</Button>
        </div>

        <div className="flex items-center justify-center gap-2 max-w-xl mx-auto mb-8">
          {allSteps.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${i <= stepIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {i + 1}
                </div>
                <span className="text-xs text-muted-foreground mt-1 hidden sm:block">{label}</span>
              </div>
              {i < allSteps.length - 1 && (
                <div className={`h-0.5 flex-1 -mt-4 sm:-mt-6 ${i < stepIndex ? "bg-primary" : "bg-muted"}`} />
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
            <EnrollmentForm onSubmit={handleInfoSubmit} onBack={() => setStep("session")} submitting={false} />
          )}
          {step === "legal" && enrollmentData && (
            <LegalAgreements parentName={enrollmentData.parentName} childName={enrollmentData.childName} onSubmit={handleLegalSubmit} onBack={() => setStep("info")} submitting={submitting} />
          )}
          {step === "payment" && enrollmentIds.length > 0 && enrollmentData && (
            <EnrollmentCheckout
              priceIds={getCheckoutPriceIds()}
              customerEmail={enrollmentData.parentEmail}
              enrollmentId={enrollmentIds[0]}
              onBack={() => setStep("legal")}
            />
          )}
          {step === "done" && level && (
            <EnrollmentConfirmation
              level={level}
              childName={childName}
              childAge={childAge}
              sessionIds={sessionIds}
              isFirstTime={isFirstTime}
              totalDue={totalDue}
            />
          )}
        </div>
      </div>
    </main>
  );
};

export default SwimEnrollment;
