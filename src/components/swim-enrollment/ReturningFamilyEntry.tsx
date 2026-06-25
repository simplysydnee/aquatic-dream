import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, ChevronRight, ArrowLeft } from "lucide-react";

export interface ReturningSwimmer {
  first_name: string;
  last_name: string;
  dob: string | null;
  last_level: string | null;
  last_enrolled_at: string | null;
}

export interface ReturningFamilyLookup {
  parent: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
  emergency: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    relationship: string | null;
  } | null;
  swimmers: ReturningSwimmer[];
  email: string;
}

interface Props {
  onStartNew: () => void;
  onLookupComplete: (result: ReturningFamilyLookup) => void;
  onPickExisting: (swimmer: ReturningSwimmer, lookup: ReturningFamilyLookup) => void;
  onAddNewForReturning: (lookup: ReturningFamilyLookup) => void;
}

const ReturningFamilyEntry = ({
  onStartNew,
  onLookupComplete,
  onPickExisting,
  onAddNewForReturning,
}: Props) => {
  const { toast } = useToast();
  const [phase, setPhase] = useState<"choose" | "email" | "results">("choose");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookup, setLookup] = useState<ReturningFamilyLookup | null>(null);

  const runLookup = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_returning_family_by_email", {
        _email: trimmed,
      });
      if (error) throw error;
      const result = {
        parent: (data as any)?.parent ?? null,
        emergency: (data as any)?.emergency ?? null,
        swimmers: ((data as any)?.swimmers ?? []) as ReturningSwimmer[],
        email: trimmed,
      };

      if (!result.parent && result.swimmers.length === 0) {
        toast({
          title: "We couldn't find that email",
          description: "Continue as a new family or try a different email.",
        });
        setLoading(false);
        return;
      }
      setLookup(result);
      onLookupComplete(result);
      setPhase("results");
    } catch (e) {
      console.error("returning lookup failed", e);
      toast({ title: "Lookup failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-xl mx-auto"
    >
      <h3 className="font-display text-2xl font-bold text-foreground mb-1">
        {phase === "results" ? "Welcome back!" : "Let's get started"}
      </h3>
      <p className="text-muted-foreground text-sm mb-6">
        {phase === "results"
          ? "We found your info. Pick a swimmer to re-enroll or add a new one."
          : "Have you enrolled a swimmer with us before? Returning families skip the paperwork."}
      </p>

      {phase === "choose" && (
        <div className="grid sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPhase("email")}
            className="border border-border rounded-lg p-5 text-left hover:border-primary hover:bg-primary/5 transition-colors"
          >
            <div className="font-semibold text-foreground mb-1">Yes, returning family</div>
            <div className="text-xs text-muted-foreground">
              We'll pull up your saved info so you can pick a new session in a couple of taps.
            </div>
          </button>
          <button
            type="button"
            onClick={onStartNew}
            className="border border-border rounded-lg p-5 text-left hover:border-primary hover:bg-primary/5 transition-colors"
          >
            <div className="font-semibold text-foreground mb-1">No, we're new here</div>
            <div className="text-xs text-muted-foreground">
              Walk through the quick assessment and enroll your swimmer.
            </div>
          </button>
        </div>
      )}

      {phase === "email" && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="returning-email">Parent email used on the previous enrollment</Label>
            <Input
              id="returning-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parent@example.com"
              className="mt-1"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") runLookup(); }}
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 justify-between">
            <Button type="button" variant="ghost" onClick={() => setPhase("choose")}>
              <ArrowLeft className="mr-1 w-4 h-4" /> Back
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onStartNew} disabled={loading}>
                Continue as new family
              </Button>
              <Button
                type="button"
                onClick={runLookup}
                disabled={loading}
                className="bg-coral hover:bg-coral/90 text-coral-foreground"
              >
                {loading ? (<><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Looking up...</>) : (<>Look me up <ChevronRight className="ml-1 w-4 h-4" /></>)}
              </Button>
            </div>
          </div>
        </div>
      )}

      {phase === "results" && lookup && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {lookup.parent?.first_name ? (
              <>Welcome back, <span className="font-semibold text-foreground">{lookup.parent.first_name}</span>. Pick a swimmer to re-enroll:</>
            ) : (
              <>Pick a swimmer to re-enroll:</>
            )}
          </div>

          {lookup.swimmers.length === 0 && (
            <div className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-4">
              No previous swimmers on file under this email. You can still add a new swimmer with your saved contact info.
            </div>
          )}

          {lookup.swimmers.map((s, i) => (
            <button
              key={`${s.first_name}-${s.last_name}-${s.dob}-${i}`}
              type="button"
              onClick={() => onPickExisting(s, lookup)}
              className="w-full border border-border rounded-lg p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-between gap-3"
            >
              <div>
                <div className="font-semibold text-foreground">
                  {s.first_name} {s.last_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.last_level ? `Last level: ${s.last_level}` : "Returning swimmer"}
                  {s.dob ? ` • DOB ${s.dob}` : ""}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}

          <button
            type="button"
            onClick={() => onAddNewForReturning(lookup)}
            className="w-full border border-dashed border-primary/40 rounded-lg p-4 text-left hover:bg-primary/5 transition-colors flex items-center gap-3"
          >
            <UserPlus className="w-5 h-5 text-primary" />
            <div>
              <div className="font-semibold text-foreground">Add a new swimmer</div>
              <div className="text-xs text-muted-foreground">
                Sibling or another child not listed above. We'll pre-fill your contact info.
              </div>
            </div>
          </button>

          <div className="pt-2">
            <Button type="button" variant="ghost" onClick={onStartNew} className="text-xs">
              Not you? Start fresh as a new family
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ReturningFamilyEntry;
