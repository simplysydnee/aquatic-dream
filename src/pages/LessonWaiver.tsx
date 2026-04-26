import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
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
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Waiver unavailable</h1>
          <p className="text-muted-foreground">
            {error || "This waiver link is invalid."}
          </p>
          <Button asChild>
            <Link to="/">Return home</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
          <h1 className="text-2xl font-semibold">Waiver complete</h1>
          <p className="text-muted-foreground">
            Thanks {booking.parent_name}! Your waiver is on file. We'll see{" "}
            {booking.child_name || "you"} at the pool.
          </p>
          <Button asChild>
            <Link to="/">Return home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const lessonLabel =
    booking.lesson_type === "private" ? "Private Lesson" : "Semi-Private Lesson";

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            {lessonLabel} Waiver
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            For {booking.child_name || booking.parent_name}
          </p>
        </div>
        <LegalAgreements
          parentName={booking.parent_name}
          childName={booking.child_name || booking.parent_name}
          onSubmit={handleSubmit}
          onBack={() => window.history.back()}
          submitting={submitting}
        />
      </div>
    </div>
  );
};

export default LessonWaiver;
