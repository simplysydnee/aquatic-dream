import { useState } from "react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import SwimAssessment from "@/components/swim-enrollment/SwimAssessment";
import SessionPicker from "@/components/swim-enrollment/SessionPicker";
import EnrollmentForm, { EnrollmentFormData } from "@/components/swim-enrollment/EnrollmentForm";
import EnrollmentConfirmation from "@/components/swim-enrollment/EnrollmentConfirmation";
import { SwimLevel, LEVEL_DISPLAY } from "@/components/swim-enrollment/types";

type Step = "assess" | "session" | "info" | "done";

const STEP_LABELS = ["Assessment", "Session", "Details", "Confirmed"];

const SwimEnrollment = () => {
  const [step, setStep] = useState<Step>("assess");
  const [level, setLevel] = useState<SwimLevel | null>(null);
  const [childAge, setChildAge] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [childName, setChildName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const stepIndex = ["assess", "session", "info", "done"].indexOf(step);

  const handleAssessmentComplete = (recommendedLevel: SwimLevel, age: number) => {
    setLevel(recommendedLevel);
    setChildAge(age);
    setStep("session");
  };

  const handleSessionSelect = (id: string) => {
    setSessionId(id);
    setStep("info");
  };

  const handleEnrollmentSubmit = async (data: EnrollmentFormData) => {
    if (!level || !sessionId) return;
    setSubmitting(true);

    // Check spots still available
    const { count } = await supabase
      .from("swim_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .in("status", ["pending", "confirmed"]);

    const { data: session } = await supabase
      .from("swim_sessions")
      .select("max_students")
      .eq("id", sessionId)
      .single();

    if (session && count !== null && count >= session.max_students) {
      toast({
        title: "Session is full",
        description: "This session just filled up. Please go back and choose another.",
        variant: "destructive",
      });
      setSubmitting(false);
      setStep("session");
      return;
    }

    const { error } = await supabase.from("swim_enrollments").insert({
      swim_level: level,
      session_id: sessionId,
      parent_name: data.parentName,
      parent_email: data.parentEmail,
      parent_phone: data.parentPhone || null,
      child_name: data.childName,
      child_age: childAge,
      notes: data.notes || null,
    });

    setSubmitting(false);

    if (error) {
      toast({
        title: "Something went wrong",
        description: "Please try again or contact us directly.",
        variant: "destructive",
      });
      return;
    }

    setChildName(data.childName);
    setStep("done");
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <section className="bg-gradient-to-br from-primary/10 to-background py-12">
        <div className="container">
          <p className="text-primary font-medium tracking-wider uppercase text-sm mb-2">
            Swim Enrollment
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
            Enroll Your Swimmer
          </h1>
        </div>
      </section>

      {/* Stepper */}
      <div className="container py-6">
        <div className="flex items-center justify-center gap-2 max-w-md mx-auto mb-8">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    i <= stepIndex
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </div>
                <span className="text-xs text-muted-foreground mt-1 hidden sm:block">
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 -mt-4 sm:-mt-6 ${
                    i < stepIndex ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="pb-16">
          {step === "assess" && (
            <SwimAssessment onComplete={handleAssessmentComplete} />
          )}
          {step === "session" && level && (
            <SessionPicker
              level={level}
              onSelect={handleSessionSelect}
              onBack={() => setStep("assess")}
            />
          )}
          {step === "info" && (
            <EnrollmentForm
              childAge={childAge}
              onSubmit={handleEnrollmentSubmit}
              onBack={() => setStep("session")}
              submitting={submitting}
            />
          )}
          {step === "done" && level && (
            <EnrollmentConfirmation level={level} childName={childName} />
          )}
        </div>
      </div>
    </main>
  );
};

export default SwimEnrollment;
