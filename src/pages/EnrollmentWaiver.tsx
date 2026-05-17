import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, Loader2, Calendar, Clock, Mail, Phone } from "lucide-react";
import LegalAgreements, {
  type LegalAgreementData,
} from "@/components/swim-enrollment/LegalAgreements";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  fetchEnrollmentByWaiverToken,
  submitEnrollmentWaiver,
  type EnrollmentWaiverRow,
} from "@/lib/enrollmentWaiver";

const fmtTime = (t?: string | null) => {
  if (!t) return "";
  try {
    return new Date(`2000-01-01T${t}`).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return t;
  }
};

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
};

const EnrollmentWaiver = () => {
  const { token = "" } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<EnrollmentWaiverRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const row = await fetchEnrollmentByWaiverToken(token);
        if (!active) return;
        if (!row) {
          setError("This waiver link is invalid or has expired.");
        } else {
          setEnrollment(row);
          if (row.waiver_signed_at) setDone(true);
        }
      } catch (e: any) {
        setError(e?.message || "Could not load waiver");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (data: LegalAgreementData) => {
    if (!enrollment) return;
    setSubmitting(true);
    try {
      await submitEnrollmentWaiver({
        token,
        enrollmentId: enrollment.id,
        parentEmail: enrollment.parent_email,
        data,
      });
      setDone(true);
      toast({ title: "Waiver signed", description: "Thank you!" });
    } catch (e: any) {
      toast({
        title: "Could not save waiver",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !enrollment) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-5">
          <h1 className="text-2xl font-semibold">Waiver unavailable</h1>
          <p className="text-muted-foreground">
            {error || "This waiver link is invalid."}
          </p>
          <div className="bg-muted/40 border border-border rounded-lg p-4 text-left text-sm space-y-2">
            <p className="font-medium text-foreground">Need help?</p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Phone className="w-4 h-4" />
              <a href="tel:+12095773483" className="hover:underline">(209) 577-3483</a>
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Mail className="w-4 h-4" />
              <a
                href="mailto:info@aquaticdreamsswim.com?subject=Waiver%20link%20issue"
                className="hover:underline break-all"
              >
                info@aquaticdreamsswim.com
              </a>
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/">Return home</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (done) {
    const needsPayment =
      enrollment.is_first_time &&
      enrollment.payment_status !== "paid" &&
      enrollment.payment_status !== "comp" &&
      enrollment.payment_status !== "waived";

    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="max-w-md text-center space-y-5">
          <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
          <h1 className="text-2xl font-semibold">Waiver complete</h1>
          <p className="text-muted-foreground">
            Thanks {enrollment.parent_name}! Your waiver is on file for{" "}
            {enrollment.child_name}.
          </p>
          {needsPayment ? (
            <div className="space-y-3">
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-sm text-foreground">
                <p className="font-medium mb-1">Next: pay the $45 registration fee</p>
                <p className="text-muted-foreground text-xs">
                  Check your inbox for the secure Stripe payment link we emailed you.
                  Your spot is reserved once payment is complete.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Didn't get the email? Call us at{" "}
                <a href="tel:+12095773483" className="underline">(209) 577-3483</a> and
                we'll resend it.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              You're all set — see you at the pool!
            </p>
          )}
        </div>
      </div>
    );
  }

  const summaryItems = [
    enrollment.session_start_time
      ? { icon: Clock, label: `${fmtTime(enrollment.session_start_time)}${enrollment.session_day ? ` · ${enrollment.session_day}` : ""}` }
      : null,
    enrollment.session_start_date
      ? { icon: Calendar, label: fmtDate(enrollment.session_start_date) }
      : null,
  ].filter(Boolean) as { icon: any; label: string }[];

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-5 text-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Enrollment waiver
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mt-1">
            {enrollment.session_name || enrollment.swim_level}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            For {enrollment.child_name}
          </p>
        </div>

        {summaryItems.length > 0 && (
          <div className="bg-muted/40 border border-border rounded-lg p-4 mb-6 space-y-2">
            {summaryItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-center gap-2 text-sm text-foreground">
                  <Icon className="w-4 h-4 text-primary shrink-0" />
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>
        )}

        <LegalAgreements
          parentName={enrollment.parent_name}
          childName={enrollment.child_name}
          onSubmit={handleSubmit}
          onBack={() => window.history.back()}
          submitting={submitting}
          submitLabel="Sign & Submit Waiver"
          submittingLabel="Submitting..."
          headerTitle="Liability Waiver & Agreements"
          headerSubtitle={
            <p>
              Please review and accept the following documents for{" "}
              <span className="font-medium text-foreground">{enrollment.child_name}</span>
              's enrollment.
            </p>
          }
        />
      </div>
    </div>
  );
};

export default EnrollmentWaiver;
