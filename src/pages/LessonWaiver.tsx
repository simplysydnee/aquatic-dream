import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, Loader2, Calendar, Clock, User, Mail, Phone } from "lucide-react";
import LegalAgreements, {
  type LegalAgreementData,
} from "@/components/swim-enrollment/LegalAgreements";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  fetchLessonBookingByToken,
  submitLessonWaiver,
  type LessonWaiverBooking,
} from "@/lib/lessonWaiver";

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

const LessonWaiver = () => {
  const { token = "" } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<LessonWaiverBooking | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const row = await fetchLessonBookingByToken(token);
        if (!active) return;
        if (!row) {
          setError("This waiver link is invalid or has expired.");
        } else {
          setBooking(row);
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
    if (!booking) return;
    setSubmitting(true);
    try {
      await submitLessonWaiver({
        token,
        bookingId: booking.id,
        parentEmail: booking.parent_email,
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

  if (error || !booking) {
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
            <p className="text-xs text-muted-foreground pt-1">
              We can re-send a fresh waiver link right away.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/">Return home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const lessonLabel =
    booking.lesson_type === "private" ? "Private Lesson" : "Semi-Private Lesson";

  if (done) {
    const needsPayment =
      booking.next_checkout_url &&
      booking.next_payment_status &&
      booking.next_payment_status !== "paid" &&
      booking.next_payment_status !== "comp";

    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="max-w-md text-center space-y-5">
          <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
          <h1 className="text-2xl font-semibold">Waiver complete</h1>
          <p className="text-muted-foreground">
            Thanks {booking.parent_name}! Your waiver is on file
            {booking.child_name ? ` for ${booking.child_name}` : ""}.
          </p>
          {needsPayment ? (
            <div className="space-y-3">
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-sm text-foreground">
                <p className="font-medium mb-1">Next: complete payment</p>
                <p className="text-muted-foreground text-xs">
                  Pay for your {fmtDate(booking.next_occurrence_date)} lesson to confirm the spot.
                </p>
              </div>
              <Button asChild size="lg" className="w-full">
                <a href={booking.next_checkout_url!}>Pay for next lesson</a>
              </Button>
              <p className="text-xs text-muted-foreground">
                You'll receive payment links by email for each upcoming lesson.
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
    booking.start_time && booking.end_time
      ? {
          icon: Clock,
          label: `${fmtTime(booking.start_time)} – ${fmtTime(booking.end_time)}`,
        }
      : null,
    booking.series_start
      ? {
          icon: Calendar,
          label: booking.recurring && booking.series_end
            ? `${fmtDate(booking.series_start)} → ${fmtDate(booking.series_end)}`
            : fmtDate(booking.series_start),
        }
      : null,
    booking.instructor_name
      ? { icon: User, label: `Instructor: ${booking.instructor_name}` }
      : null,
  ].filter(Boolean) as { icon: any; label: string }[];

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-5 text-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Pre-lesson waiver
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mt-1">
            {lessonLabel}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            For {booking.child_name || booking.parent_name}
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
          parentName={booking.parent_name}
          childName={booking.child_name || booking.parent_name}
          onSubmit={handleSubmit}
          onBack={() => window.history.back()}
          submitting={submitting}
          submitLabel="Sign & Submit Waiver"
          submittingLabel="Submitting..."
          headerTitle="Liability Waiver & Agreements"
          headerSubtitle={
            <p>
              Please review and accept the following documents for{" "}
              <span className="font-medium text-foreground">
                {booking.child_name || booking.parent_name}
              </span>
              's lesson.
            </p>
          }
        />
      </div>
    </div>
  );
};

export default LessonWaiver;
