import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";

interface SessionLite {
  id: string;
  session_name: string | null;
  day_of_week: string;
  start_time: string;
  swim_level: string;
  age_group: string | null;
  max_students: number;
  session_period_id: string | null;
}

interface PeriodLite {
  id: string;
  name: string;
  start_date: string;
}

interface EnrollmentLite {
  id: string;
  child_name: string;
  swim_level: string;
  session_id: string | null;
  notes?: string | null;
  status?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  enrollment: EnrollmentLite | null;
  sessions: SessionLite[];
  periods: PeriodLite[];
  /** All non-cancelled enrollments, used to compute live capacity per session */
  allEnrollments: { id: string; session_id: string | null; status?: string }[];
  onMoved?: () => void;
}

const DAY_SHORT: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};
const fmtDay = (d: string) =>
  d.toLowerCase().split("_").map((p) => DAY_SHORT[p] || p).join(" & ");
const fmtTime = (t: string) => {
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
};

const LEVELS: SwimLevel[] = ["white", "red", "yellow", "blue", "green"];

export default function MoveSwimmerDialog({
  open, onOpenChange, enrollment, sessions, periods, allEnrollments, onMoved,
}: Props) {
  const [newSessionId, setNewSessionId] = useState("");
  const [newLevel, setNewLevel] = useState<string>("");
  const [extraNote, setExtraNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && enrollment) {
      setNewSessionId("");
      setNewLevel(enrollment.swim_level);
      setExtraNote("");
    }
  }, [open, enrollment]);

  const countsBySession = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of allEnrollments) {
      if (!e.session_id || e.status === "cancelled") continue;
      counts[e.session_id] = (counts[e.session_id] || 0) + 1;
    }
    return counts;
  }, [allEnrollments]);

  const currentSession = enrollment?.session_id
    ? sessions.find((s) => s.id === enrollment.session_id)
    : null;
  const targetSession = newSessionId ? sessions.find((s) => s.id === newSessionId) : null;
  const targetCount = targetSession ? countsBySession[targetSession.id] || 0 : 0;
  const targetIsFull = targetSession ? targetCount >= targetSession.max_students : false;
  const levelMismatch =
    !!targetSession && !!newLevel && targetSession.swim_level !== newLevel;

  const sessionsByPeriod = useMemo(() => {
    const byId: Record<string, SessionLite[]> = {};
    const unassigned: SessionLite[] = [];
    for (const s of sessions) {
      if (s.id === enrollment?.session_id) continue;
      if (s.session_period_id) {
        (byId[s.session_period_id] ||= []).push(s);
      } else {
        unassigned.push(s);
      }
    }
    Object.values(byId).forEach((arr) =>
      arr.sort((a, b) => a.start_time.localeCompare(b.start_time))
    );
    return { byId, unassigned };
  }, [sessions, enrollment?.session_id]);

  const orderedPeriods = useMemo(
    () => [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [periods]
  );

  const labelFor = (s: SessionLite) => {
    const count = countsBySession[s.id] || 0;
    const full = count >= s.max_students;
    const lvl = LEVEL_DISPLAY[s.swim_level as SwimLevel]?.name || s.swim_level;
    return `${fmtDay(s.day_of_week)} · ${fmtTime(s.start_time)} · ${lvl}${
      s.session_name ? ` · ${s.session_name}` : ""
    } · ${count}/${s.max_students}${full ? " · FULL" : ""}`;
  };

  const currentLabel = currentSession
    ? `${fmtDay(currentSession.day_of_week)} ${fmtTime(currentSession.start_time)} · ${
        LEVEL_DISPLAY[currentSession.swim_level as SwimLevel]?.name || currentSession.swim_level
      }`
    : "no class assigned";

  const handleMove = async () => {
    if (!enrollment || !newSessionId || !newLevel) return;
    setBusy(true);
    try {
      const stamp = new Date().toLocaleDateString();
      const movedNote = `[${stamp}] Moved from ${currentLabel} → ${
        targetSession ? labelFor(targetSession) : "new class"
      }${newLevel !== enrollment.swim_level ? ` (level ${enrollment.swim_level} → ${newLevel})` : ""}${
        extraNote.trim() ? ` — ${extraNote.trim()}` : ""
      }`;
      const mergedNotes = enrollment.notes
        ? `${enrollment.notes}\n${movedNote}`
        : movedNote;

      const { data, error } = await supabase
        .from("swim_enrollments")
        .update({
          session_id: newSessionId,
          swim_level: newLevel,
          notes: mergedNotes,
        })
        .eq("id", enrollment.id)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error("No row updated — check permissions.");

      // Fire-and-await: resend confirmation email with new class details + calendar invite.
      let emailNote = "";
      try {
        const { error: invokeErr } = await supabase.functions.invoke(
          "resend-enrollment-confirmation",
          {
            body: {
              enrollmentId: enrollment.id,
              reason: "moved",
              previousSessionLabel: currentLabel,
              previousLevel: enrollment.swim_level,
            },
          },
        );
        if (invokeErr) {
          emailNote = " (confirmation email failed to send)";
          console.error("Resend confirmation failed:", invokeErr);
        } else {
          emailNote = " Updated confirmation sent to parent.";
        }
      } catch (e) {
        emailNote = " (confirmation email failed to send)";
        console.error(e);
      }

      toast({
        title: "Moved",
        description: `${enrollment.child_name} moved to ${
          targetSession ? labelFor(targetSession) : "new class"
        }.${emailNote}`,
      });
      onOpenChange(false);
      onMoved?.();
    } catch (err: any) {
      toast({
        title: "Could not move swimmer",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move {enrollment?.child_name}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Currently in <span className="font-medium">{currentLabel}</span>
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">New class</Label>
            <Select value={newSessionId} onValueChange={setNewSessionId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a class…" />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {orderedPeriods.map((p) =>
                  sessionsByPeriod.byId[p.id]?.length ? (
                    <SelectGroup key={p.id}>
                      <SelectLabel>{p.name}</SelectLabel>
                      {sessionsByPeriod.byId[p.id].map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {labelFor(s)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null
                )}
                {sessionsByPeriod.unassigned.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Unassigned</SelectLabel>
                    {sessionsByPeriod.unassigned.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {labelFor(s)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Swimmer's level</Label>
            <div className="mt-1 flex items-center gap-2">
              <Select value={newLevel} onValueChange={setNewLevel}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {LEVEL_DISPLAY[l].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {levelMismatch && targetSession && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setNewLevel(targetSession.swim_level)}
                >
                  Match class ({LEVEL_DISPLAY[targetSession.swim_level as SwimLevel]?.name || targetSession.swim_level})
                </Button>
              )}
            </div>
            {levelMismatch && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Target class is {LEVEL_DISPLAY[targetSession!.swim_level as SwimLevel]?.name || targetSession!.swim_level}.
                The swimmer's level is independent — change it if they're being moved up or down.
              </p>
            )}
          </div>

          {targetIsFull && targetSession && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                This class is already at {targetCount}/{targetSession.max_students}.
                Moving will put it at {targetCount + 1}/{targetSession.max_students}.
              </AlertDescription>
            </Alert>
          )}

          <div>
            <Label className="text-xs">Reason / note (optional)</Label>
            <Textarea
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              placeholder="e.g. parent requested time change"
              rows={2}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={busy || !newSessionId || !newLevel}
            variant={targetIsFull ? "destructive" : "default"}
          >
            {busy ? "Moving…" : targetIsFull ? "Move anyway" : "Move swimmer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
