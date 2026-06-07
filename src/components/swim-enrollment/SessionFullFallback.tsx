import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, Calendar, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface SessionFullFallbackProps {
  swimLevel?: string | null;
  sessionId?: string | null;
  sessionLabel?: string | null;
  parentFirstName?: string;
  parentLastName?: string;
  parentEmail?: string;
  parentPhone?: string | null;
  childFirstName?: string;
  childLastName?: string;
  childAge?: number | null;
  onPickDifferentSession: () => void;
}

/**
 * Friendly fallback shown whenever a parent tries to enroll in a session
 * that is full. We auto-submit a waitlist row + email the owner, then offer
 * concrete next steps (private lesson, different session, wait).
 */
export default function SessionFullFallback({
  swimLevel,
  sessionId,
  sessionLabel,
  parentFirstName = "",
  parentLastName = "",
  parentEmail = "",
  parentPhone = null,
  childFirstName = "",
  childLastName = "",
  childAge = null,
  onPickDifferentSession,
}: SessionFullFallbackProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<"submitting" | "saved" | "error">("submitting");
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    // Need at least an email + names to make a useful waitlist row.
    if (!parentEmail || !parentFirstName || !childFirstName) {
      setState("error");
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("submit-waitlist-request", {
          body: {
            parentFirstName,
            parentLastName,
            parentEmail,
            parentPhone,
            childFirstName,
            childLastName,
            childAge,
            swimLevel: swimLevel || null,
            sessionId: sessionId || null,
            sourcePage: typeof window !== "undefined" ? window.location.pathname : null,
          },
        });
        if (error || !data?.success) {
          throw new Error(error?.message || data?.error || "Failed to save waitlist");
        }
        setState("saved");
      } catch (e) {
        console.error("waitlist submit failed", e);
        setState("error");
        toast({
          title: "Couldn't save your waitlist spot",
          description: "Please call (209) 577-3483 and we'll add you manually.",
          variant: "destructive",
        });
      }
    })();
  }, [
    parentEmail,
    parentFirstName,
    parentLastName,
    parentPhone,
    childFirstName,
    childLastName,
    childAge,
    swimLevel,
    sessionId,
  ]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">
              That class just filled up
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {swimLevel ? <><span className="font-semibold text-foreground">{swimLevel}</span> · </> : null}
              {sessionLabel || "Selected session"} is at capacity.
              We keep classes to 3 swimmers max so every kid gets real attention.
            </p>
          </div>
        </div>

        {/* Waitlist status */}
        <div className="rounded-lg bg-muted/40 border border-border p-4 mb-5">
          {state === "submitting" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving your spot on the waitlist…
            </div>
          )}
          {state === "saved" && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">You're on the waitlist.</p>
                <p className="text-muted-foreground mt-0.5">
                  We emailed <span className="font-medium text-foreground">{parentEmail}</span> a
                  confirmation and notified the owner. If a seat opens, you'll hear from us first.
                </p>
              </div>
            </div>
          )}
          {state === "error" && (
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">We couldn't auto-save your waitlist spot.</p>
                <p className="text-muted-foreground mt-0.5">
                  Call us at <a href="tel:+12095773483" className="underline">(209) 577-3483</a> and we'll
                  add you in seconds — or pick a different option below.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Primary CTA — private lesson */}
        <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-5 mb-3">
          <div className="flex items-start gap-3 mb-3">
            <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">
                Don't want to wait? Book a private lesson — <span className="text-primary">$50 for June</span>.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                One-on-one with an instructor, faster progress, and you pick the day and time.
                Most parents book within the same week.
              </p>
            </div>
          </div>
          <Button
            size="lg"
            className="w-full"
            onClick={() => navigate("/book-private-lesson")}
          >
            Book a private lesson
          </Button>
        </div>

        {/* Secondary — pick a different session */}
        <Button
          variant="outline"
          size="lg"
          className="w-full mb-2"
          onClick={onPickDifferentSession}
        >
          <Calendar className="w-4 h-4 mr-2" />
          Pick a different session or level
        </Button>

        <p className="text-xs text-muted-foreground text-center mt-3">
          Questions? Call <a href="tel:+12095773483" className="underline">(209) 577-3483</a> or
          email <a href="mailto:info@aquaticdreamsswim.com" className="underline">info@aquaticdreamsswim.com</a>.
        </p>
      </div>
    </div>
  );
}
