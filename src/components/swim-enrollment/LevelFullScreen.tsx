import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Calendar, ChevronLeft, Loader2, Sparkles, CheckCircle2, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SwimLevel, AgeGroup, getGroupName, LEVEL_DISPLAY } from "./types";

interface Props {
  level: SwimLevel;
  childAge: number;
  ageGroup: AgeGroup;
  onBack: () => void;
  /** "full" = real capacity exhaustion, "age-mismatch" = this level isn't offered for this age bucket */
  reason?: "full" | "age-mismatch";
}

type Mode = "choose" | "waitlist" | "saved";

const LevelFullScreen = ({ level, childAge, ageGroup, onBack, reason = "full" }: Props) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("choose");
  const [submitting, setSubmitting] = useState(false);
  const isAgeMismatch = reason === "age-mismatch";
  const [form, setForm] = useState({
    parentFirstName: "",
    parentLastName: "",
    parentEmail: "",
    parentPhone: "",
    childFirstName: "",
    childLastName: "",
    notes: "",
  });

  const groupName = getGroupName(level, ageGroup);
  const levelName = LEVEL_DISPLAY[level].name;

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const submitWaitlist = async () => {
    const required: (keyof typeof form)[] = ["parentFirstName", "parentLastName", "parentEmail", "childFirstName", "childLastName"];
    for (const k of required) {
      if (!form[k].trim()) {
        toast({ title: "Missing info", description: "Please fill out all required fields.", variant: "destructive" });
        return;
      }
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.parentEmail)) {
      toast({ title: "Invalid email", description: "Please enter a valid email.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("submit-waitlist-request", {
        body: {
          parentFirstName: form.parentFirstName.trim(),
          parentLastName: form.parentLastName.trim(),
          parentEmail: form.parentEmail.trim(),
          parentPhone: form.parentPhone.trim() || null,
          childFirstName: form.childFirstName.trim(),
          childLastName: form.childLastName.trim(),
          childAge: childAge || null,
          swimLevel: level,
          sessionId: null,
          sourcePage: "session-picker-level-full",
          notes: form.notes.trim() || null,
        },
      });
      if (error) throw error;
      setMode("saved");
    } catch (e) {
      console.error(e);
      toast({
        title: "Couldn't save waitlist",
        description: "Please call (209) 577-3483 or email info@aquaticdreamsswim.com and we'll add you.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto">
      <Card className="p-6 sm:p-8 border-2 border-primary/20">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-display text-2xl font-bold text-foreground">
              {isAgeMismatch
                ? `${levelName} isn't offered for this age right now`
                : `${groupName} is full for this session`}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {isAgeMismatch
                ? `${levelName} sessions are currently scheduled for a different age group. You haven't been charged or enrolled — please go back and pick a different level, or contact us if you'd like help placing your swimmer.`
                : `${levelName} · We cap each class at 3 swimmers so every kid gets real attention. You haven't been charged or enrolled.`}
            </p>
          </div>
        </div>

        {mode === "choose" && (
          <>
            <div className="grid sm:grid-cols-2 gap-3 mt-6">
              {!isAgeMismatch && (
                <button
                  onClick={() => setMode("waitlist")}
                  className="text-left p-5 rounded-xl border-2 border-border hover:border-primary bg-card transition-all group"
                >
                  <Calendar className="w-6 h-6 text-primary mb-2" />
                  <p className="font-semibold text-foreground">Join the waitlist</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    We'll text or email you the moment a spot opens up — or if we add another {groupName} class.
                  </p>
                </button>
              )}
              {isAgeMismatch && (
                <button
                  onClick={onBack}
                  className="text-left p-5 rounded-xl border-2 border-border hover:border-primary bg-card transition-all group"
                >
                  <ChevronLeft className="w-6 h-6 text-primary mb-2" />
                  <p className="font-semibold text-foreground">Pick a different level</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Go back to the assessment and choose a level that fits your swimmer's age.
                  </p>
                </button>
              )}
              <button
                onClick={() => navigate("/book-private-lesson")}
                className="text-left p-5 rounded-xl border-2 border-border hover:border-primary bg-card transition-all group"
              >
                <Sparkles className="w-6 h-6 text-primary mb-2" />
                <p className="font-semibold text-foreground">Book a private lesson</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Skip the wait. 1-on-1 with an instructor on your schedule — $50/lesson summer special.
                </p>
              </button>
            </div>
            <div className="mt-6 pt-4 border-t border-border flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> <a href="tel:+12095773483" className="underline">(209) 577-3483</a>
              </span>
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> <a href="mailto:info@aquaticdreamsswim.com" className="underline">info@aquaticdreamsswim.com</a>
              </span>
            </div>
          </>
        )}

        {mode === "waitlist" && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-foreground">
              Quick info so we can reach you. <strong>This puts you on the waitlist only — no enrollment, no charge.</strong>
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pfn">Parent first name *</Label>
                <Input id="pfn" value={form.parentFirstName} onChange={update("parentFirstName")} />
              </div>
              <div>
                <Label htmlFor="pln">Parent last name *</Label>
                <Input id="pln" value={form.parentLastName} onChange={update("parentLastName")} />
              </div>
              <div>
                <Label htmlFor="pe">Email *</Label>
                <Input id="pe" type="email" value={form.parentEmail} onChange={update("parentEmail")} />
              </div>
              <div>
                <Label htmlFor="pp">Phone</Label>
                <Input id="pp" type="tel" value={form.parentPhone} onChange={update("parentPhone")} />
              </div>
              <div>
                <Label htmlFor="cfn">Swimmer first name *</Label>
                <Input id="cfn" value={form.childFirstName} onChange={update("childFirstName")} />
              </div>
              <div>
                <Label htmlFor="cln">Swimmer last name *</Label>
                <Input id="cln" value={form.childLastName} onChange={update("childLastName")} />
              </div>
            </div>
            <div>
              <Label htmlFor="nt">Anything else? (optional)</Label>
              <Textarea id="nt" value={form.notes} onChange={update("notes")} placeholder="Preferred days/times, sibling info, etc." rows={3} />
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-2">
              <Button variant="ghost" onClick={() => setMode("choose")} disabled={submitting}>
                <ChevronLeft className="mr-1 w-4 h-4" /> Back
              </Button>
              <Button onClick={submitWaitlist} disabled={submitting} className="bg-primary text-primary-foreground">
                {submitting ? <><Loader2 className="mr-1 w-4 h-4 animate-spin" /> Saving…</> : "Join the waitlist"}
              </Button>
            </div>
          </div>
        )}

        {mode === "saved" && (
          <div className="mt-4 text-center py-6">
            <div className="w-12 h-12 rounded-full bg-emerald-100 mx-auto flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <h4 className="font-display text-xl font-bold text-foreground">You're on the waitlist</h4>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
              We have not enrolled you or charged you for anything. We'll reach out as soon as a {groupName} spot opens up.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 mt-6 max-w-md mx-auto">
              <Button variant="outline" onClick={onBack}>Pick a different level</Button>
              <Button onClick={() => navigate("/book-private-lesson")} className="bg-primary text-primary-foreground">
                <Sparkles className="mr-1 w-4 h-4" /> See private lessons
              </Button>
            </div>
          </div>
        )}
      </Card>

      {mode === "choose" && (
        <div className="mt-6">
          <Button variant="ghost" onClick={onBack} className="w-full sm:w-auto">
            <ChevronLeft className="mr-1 w-4 h-4" /> Back to assessment
          </Button>
        </div>
      )}
    </motion.div>
  );
};

export default LevelFullScreen;
