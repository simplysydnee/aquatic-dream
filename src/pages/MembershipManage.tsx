import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import ClosureScheduleNote from "@/components/ClosureScheduleNote";


type Membership = {
  id: string;
  status: string;
  planKey: string;
  parentFirstName: string | null;
  parentLastName: string | null;
  childFirstName: string | null;
  childLastName: string | null;
  startDate: string | null;
  monthlyPriceCents: number | null;
  cancelEffectiveDate: string | null;
  cancelRequestedAt: string | null;
  slot: { day_of_week: number | null; start_time: string | null; level: string | null } | null;
  nextOccurrence: { occurrence_date: string; start_time: string | null } | null;
};

const PLAN_NAMES: Record<string, string> = {
  kid_group: "Small Group Swim",
  private: "Private Swim",
  adult_group: "Adult Swim",
};

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const REASONS: Array<{ value: string; label: string }> = [
  { value: "too_busy", label: "Too busy / schedule changed" },
  { value: "graduated", label: "Swimmer is ready to move on" },
  { value: "cost", label: "Cost" },
  { value: "moved", label: "Moved / distance" },
  { value: "other", label: "Other" },
];

type Step = "view" | "reason" | "save-offer" | "confirm" | "done";

function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${m} ${suffix}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(`${d}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function MembershipManage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [m, setMembership] = useState<Membership | null>(null);
  const [step, setStep] = useState<Step>("view");
  const [reason, setReason] = useState<string>("");
  const [reasonDetail, setReasonDetail] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ effectiveDate?: string; finalChargeDate?: string } | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-membership-by-token?token=${encodeURIComponent(token)}`;
        const res = await fetch(url, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        });
        if (!res.ok) {
          setError("This management link is invalid or expired.");
          setLoading(false);
          return;
        }
        const json = await res.json();
        setMembership(json.membership);
      } catch (e) {
        console.error(e);
        setError("Could not load your membership. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function confirmCancellation() {
    if (!token) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-membership", {
        body: { token, reason, reasonDetail },
      });
      if (error) throw error;
      setResult(data as { effectiveDate?: string; finalChargeDate?: string });
      setStep("done");
    } catch (e) {
      console.error(e);
      setError("Something went wrong cancelling. Please call us at (209) 480-4262.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2a5e84]" />
      </div>
    );
  }

  if (error && !m) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader><CardTitle>Link not valid</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 mb-4">{error}</p>
            <Link to="/cancel" className="text-sm text-[#2a5e84] underline">Request a new link</Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!m) return null;

  const planName = PLAN_NAMES[m.planKey] || "Swim membership";
  const swimmerName = [m.childFirstName, m.childLastName].filter(Boolean).join(" ") || "Swimmer";
  const monthly = m.monthlyPriceCents
    ? `$${(m.monthlyPriceCents / 100).toFixed(m.monthlyPriceCents % 100 === 0 ? 0 : 2)}`
    : "";
  const slotLabel = m.slot
    ? `${DOW[m.slot.day_of_week ?? 0]}s at ${formatTime(m.slot.start_time)}`
    : "—";
  const isPendingCancel = m.status === "pending_cancel";
  const isCancelled = m.status === "cancelled" || m.status === "canceled";

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[#1a3a8a]">Manage membership</h1>
          <p className="text-sm text-gray-600 mt-1">
            {swimmerName} · {planName}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your membership</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between border-b pb-2"><span className="text-gray-600">Program</span><span className="font-medium">{planName}</span></div>
            <div className="flex justify-between border-b pb-2"><span className="text-gray-600">Class time</span><span className="font-medium">{slotLabel}</span></div>
            <div className="flex justify-between border-b pb-2"><span className="text-gray-600">Next lesson</span><span className="font-medium">{m.nextOccurrence ? `${formatDate(m.nextOccurrence.occurrence_date)}${m.nextOccurrence.start_time ? ` at ${formatTime(m.nextOccurrence.start_time)}` : ""}` : "—"}</span></div>
            <div className="flex justify-between border-b pb-2"><span className="text-gray-600">Monthly</span><span className="font-medium">{monthly}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Status</span><span className="font-medium capitalize">{m.status.replace("_", " ")}</span></div>
            {isPendingCancel && m.cancelEffectiveDate && (
              <div className="mt-3 rounded bg-amber-50 border border-amber-200 p-3 text-amber-900">
                Your membership is scheduled to end on <b>{formatDate(m.cancelEffectiveDate)}</b>.
              </div>
            )}
            {isCancelled && (
              <div className="mt-3 rounded bg-gray-100 p-3 text-gray-800">
                This membership has ended.
              </div>
            )}
          </CardContent>
        </Card>

        {!isCancelled && token && (
          <div>
            <a
              href={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/membership-calendar-ics?token=${encodeURIComponent(token)}`}
              className="inline-flex items-center justify-center rounded-md bg-[#2a5e84] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a3a8a]"
              download
            >
              Add this month's lessons to your calendar
            </a>
          </div>
        )}


        {!isCancelled && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Upcoming closures</CardTitle></CardHeader>
            <CardContent>
              <ClosureScheduleNote />
            </CardContent>
          </Card>
        )}


        {step === "view" && !isPendingCancel && !isCancelled && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Cancel membership</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-700">
                You can cancel online in under a minute. No phone call required.
              </p>
              <Button variant="outline" onClick={() => setStep("reason")}>
                Start cancellation
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "reason" && (
          <Card>
            <CardHeader><CardTitle className="text-lg">A quick question (optional)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-700">
                Why are you leaving? This helps us improve. You can skip the detail box.
              </p>
              <RadioGroup value={reason} onValueChange={setReason}>
                {REASONS.map((r) => (
                  <div key={r.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={r.value} id={`reason-${r.value}`} />
                    <Label htmlFor={`reason-${r.value}`} className="cursor-pointer">{r.label}</Label>
                  </div>
                ))}
              </RadioGroup>
              <div className="space-y-2">
                <Label htmlFor="detail">Anything else? (optional)</Label>
                <Textarea id="detail" value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)} maxLength={1000} rows={3} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("view")}>Back</Button>
                <Button
                  disabled={!reason}
                  onClick={() => setStep("save-offer")}
                  className="bg-[#2a5e84] hover:bg-[#1a3a8a]"
                >
                  Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "save-offer" && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Before you go</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-700">
                Would a pause or a quick chat help? We're happy to work something out.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button variant="outline" asChild>
                  <a href="tel:+12094804262">Pause instead</a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="tel:+12094804262">Talk to us</a>
                </Button>
                <Button
                  onClick={() => setStep("confirm")}
                  className="bg-[#2a5e84] hover:bg-[#1a3a8a]"
                >
                  Continue cancellation
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Pause and phone options open your phone app — nothing changes until you confirm below.
              </p>
            </CardContent>
          </Card>
        )}

        {step === "confirm" && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Confirm cancellation</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded bg-[#f7f3ee] p-4 text-sm text-gray-800 leading-relaxed">
                You'll be billed one more time on the next 1st of the month. Your membership
                stays active through the end of that final paid month, then ends. No charges
                after that.
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("save-offer")} disabled={submitting}>Back</Button>
                <Button
                  onClick={confirmCancellation}
                  disabled={submitting}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {submitting ? "Cancelling..." : "Confirm cancellation"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "done" && (
          <Card>
            <CardHeader><CardTitle className="text-lg text-[#1a3a8a]">Cancellation confirmed</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-700">
              <p>
                Thanks — we've scheduled your cancellation.
                {result?.finalChargeDate && (
                  <> Final charge on <b>{result.finalChargeDate}</b>.</>
                )}
                {result?.effectiveDate && (
                  <> Your membership ends on <b>{formatDate(result.effectiveDate)}</b>.</>
                )}
              </p>
              <p>We just emailed you a confirmation. Change your mind? Call us at (209) 480-4262 before the end date and we'll keep your spot.</p>
              <Link to="/" className="text-[#2a5e84] underline">Back to home</Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
