import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import SwimAssessment from "@/components/swim-enrollment/SwimAssessment";
import SessionPicker from "@/components/swim-enrollment/SessionPicker";
import EnrollmentForm, { EnrollmentFormData } from "@/components/swim-enrollment/EnrollmentForm";
import LegalAgreements, { LegalAgreementData } from "@/components/swim-enrollment/LegalAgreements";
import EnrollmentConfirmation from "@/components/swim-enrollment/EnrollmentConfirmation";
import LessonRequestForm from "@/components/swim-enrollment/LessonRequestForm";
import { SwimLevel, PRICING } from "@/components/swim-enrollment/types";
import { WAIVER_VERSION, TOS_VERSION, PRIVACY_POLICY_VERSION } from "@/components/swim-enrollment/legal-content";
import { Button } from "@/components/ui/button";

type Step = "assess" | "session" | "info" | "legal" | "done";

const STEP_LABELS = ["Assessment", "Session", "Details", "Agreements", "Confirmed"];

const SwimEnrollment = () => {
  const [searchParams] = useSearchParams();
  const isRequest = searchParams.get("type") === "request";

  const [step, setStep] = useState<Step>("assess");
  const [level, setLevel] = useState<SwimLevel | null>(null);
  const [childAge, setChildAge] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [childName, setChildName] = useState("");
  const [enrollmentData, setEnrollmentData] = useState<EnrollmentFormData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"group" | "request">(isRequest ? "request" : "group");
  const [isFirstTime, setIsFirstTime] = useState(true);
  const [totalDue, setTotalDue] = useState(0);
  const { toast } = useToast();

  const stepIndex = ["assess", "session", "info", "legal", "done"].indexOf(step);

  const handleAssessmentComplete = (recommendedLevel: SwimLevel, age: number) => {
    setLevel(recommendedLevel);
    setChildAge(age);
    setStep("session");
  };

  const handleSessionSelect = (id: string) => {
    setSessionId(id);
    setStep("info");
  };

  const handleInfoSubmit = async (data: EnrollmentFormData) => {
    setEnrollmentData(data);
    setChildName(data.childName);

    const firstTime = data.isFirstTime === "yes";
    setIsFirstTime(firstTime);

    // Get session price
    if (sessionId) {
      const { data: session } = await supabase
        .from("swim_sessions")
        .select("session_price")
        .eq("id", sessionId)
        .single();
      const sessionFee = session?.session_price ?? 280;
      const regFee = firstTime ? PRICING.registrationFee : 0;
      setTotalDue(sessionFee + regFee);
    }

    setStep("legal");
  };

  const handleLegalSubmit = async (legalData: LegalAgreementData) => {
    if (!level || !sessionId || !enrollmentData) return;
    setSubmitting(true);

    const { count } = await supabase
      .from("swim_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .in("status", ["enrolled"]);

    const { data: session } = await supabase
      .from("swim_sessions")
      .select("max_students, session_price, session_start_date")
      .eq("id", sessionId)
      .single();

    if (session && count !== null && count >= session.max_students) {
      toast({ title: "Session is full", description: "This session just filled up. Please go back and choose another.", variant: "destructive" });
      setSubmitting(false);
      setStep("session");
      return;
    }

    const sessionFee = session?.session_price ?? 280;
    const regFee = isFirstTime ? PRICING.registrationFee : 0;
    const paymentDueDate = session?.session_start_date || null;

    const { data: enrollment, error: enrollError } = await supabase
      .from("swim_enrollments")
      .insert({
        swim_level: level,
        session_id: sessionId,
        parent_name: enrollmentData.parentName,
        parent_email: enrollmentData.parentEmail,
        parent_phone: enrollmentData.parentPhone || null,
        child_name: enrollmentData.childName,
        child_age: childAge,
        notes: enrollmentData.notes || null,
        lesson_type: "group",
        registration_fee: regFee,
        status: "enrolled",
        payment_status: isFirstTime ? "unpaid" : "unpaid",
        payment_amount: sessionFee + regFee,
        is_first_time: isFirstTime,
        payment_due_date: paymentDueDate,
      })
      .select("id")
      .single();

    if (enrollError || !enrollment) {
      toast({ title: "Something went wrong", description: "Please try again or contact us directly.", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    let signerIp: string | null = null;
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json");
      const ipData = await ipRes.json();
      signerIp = ipData.ip;
    } catch { /* best-effort */ }

    const { error: legalError } = await supabase
      .from("enrollment_agreements")
      .insert({
        enrollment_id: enrollment.id,
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
      });

    setSubmitting(false);
    if (legalError) {
      toast({ title: "Something went wrong", description: "Please try again or contact us directly.", variant: "destructive" });
      return;
    }
    setStep("done");
  };

  // Request mode — simple form
  if (mode === "request") {
    return (
      <main className="min-h-screen bg-background">
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
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${i <= stepIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {i + 1}
                </div>
                <span className="text-xs text-muted-foreground mt-1 hidden sm:block">{label}</span>
              </div>
              {i < STEP_LABELS.length - 1 && (
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
            <EnrollmentForm childAge={childAge} onSubmit={handleInfoSubmit} onBack={() => setStep("session")} submitting={false} />
          )}
          {step === "legal" && enrollmentData && (
            <LegalAgreements parentName={enrollmentData.parentName} childName={enrollmentData.childName} onSubmit={handleLegalSubmit} onBack={() => setStep("info")} submitting={submitting} />
          )}
          {step === "done" && level && (
            <EnrollmentConfirmation
              level={level}
              childName={childName}
              childAge={childAge}
              sessionId={sessionId}
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
