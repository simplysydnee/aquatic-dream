import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ArrowRightLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { CalendarSwimSession, CalendarEnrollment, LessonDate, EnrollmentDateMove } from "@/hooks/useCalendarData";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  enrollment: CalendarEnrollment | null;
  /** Origin session the swimmer is normally enrolled in (for label) */
  originSession: CalendarSwimSession | null;
  /** The specific date this move applies to (yyyy-MM-dd) */
  dateStr: string;
  /** All swim sessions (we filter to today's same day-of-week with active lesson date) */
  allSessions: CalendarSwimSession[];
  /** Lesson dates for the visible range so we can scope to "running today" */
  lessonDates: LessonDate[];
  /** All enrollments + moves so we can compute capacity */
  allEnrollments: CalendarEnrollment[];
  movesForDate: EnrollmentDateMove[];
  /** Existing move for this enrollment on this date, if any */
  existingMove: EnrollmentDateMove | null;
  onSaved: () => void;
}

const fmtTime = (t: string) => {
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  const period = hr >= 12 ? "PM" : "AM";
  const h12 = ((hr + 11) % 12) + 1;
  return `${h12}:${m} ${period}`;
};

export default function MoveSwimmerOneDateDialog({
  open, onOpenChange, enrollment, originSession, dateStr,
  allSessions, lessonDates, allEnrollments, movesForDate, existingMove, onSaved,
}: Props) {
  const [targetSessionId, setTargetSessionId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTargetSessionId(existingMove?.target_session_id || "");
      setReason(existingMove?.reason || "");
    }
  }, [open, existingMove]);

  // Sessions that actually run on this date (non-cancelled session_lesson_dates row)
  const eligible = useMemo(() => {
    const runningIds = new Set(
      lessonDates.filter((ld) => ld.lesson_date === dateStr && !ld.is_cancelled).map((ld) => ld.session_id)
    );
    return allSessions
      .filter((s) => runningIds.has(s.id) && s.id !== enrollment?.session_id)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [allSessions, lessonDates, dateStr, enrollment?.session_id]);

  const capacityFor = (sessionId: string, maxStudents: number) => {
    const base = allEnrollments.filter((e) => e.session_id === sessionId).length;
    const movedOut = movesForDate.filter((m) => m.target_session_id !== sessionId && allEnrollments.find((e) => e.id === m.enrollment_id)?.session_id === sessionId).length;
    const movedIn = movesForDate.filter((m) => m.target_session_id === sessionId && allEnrollments.find((e) => e.id === m.enrollment_id)?.session_id !== sessionId).length;
    const occupied = base - movedOut + movedIn;
    return { occupied, capacity: maxStudents, full: occupied >= maxStudents };
  };

  const handleSave = async () => {
    if (!enrollment || !targetSessionId) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        enrollment_id: enrollment.id,
        lesson_date: dateStr,
        target_session_id: targetSessionId,
        reason: reason || null,
        created_by: u.user?.id || null,
      };
      const { error } = await supabase
        .from("enrollment_date_moves")
        .upsert(payload, { onConflict: "enrollment_id,lesson_date" });
      if (error) throw error;
      toast({ title: "Swimmer moved for this date" });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Move failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!existingMove) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("enrollment_date_moves")
        .delete()
        .eq("id", existingMove.id);
      if (error) throw error;
      toast({ title: "Move removed" });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Failed to remove", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" />
            Move {enrollment?.child_name} — this date only
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            <strong>{dateStr}</strong> only. Original enrollment in{" "}
            <em>{originSession?.session_name || originSession?.swim_level}</em> stays unchanged.
          </div>

          <div className="space-y-1.5">
            <Label>Move to class</Label>
            <Select value={targetSessionId} onValueChange={setTargetSessionId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a class running today" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {eligible.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No other classes running on this date.</div>
                )}
                {eligible.map((s) => {
                  const cap = capacityFor(s.id, s.max_students);
                  return (
                    <SelectItem key={s.id} value={s.id} disabled={cap.full && existingMove?.target_session_id !== s.id}>
                      {fmtTime(s.start_time)} · {s.swim_level} · {s.instructors?.name || "no instructor"}
                      {" "}({cap.occupied}/{cap.capacity}{cap.full ? " full" : ""})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Jaclyn out — moved to Grace's 10 AM" />
          </div>

          {existingMove && (
            <Alert>
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription className="text-xs">
                A move already exists for this date. Saving will update it.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          {existingMove && (
            <Button variant="ghost" onClick={handleRemove} disabled={busy} className="text-destructive">
              Remove move
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy || !targetSessionId}>
            {busy ? "Saving…" : (existingMove ? "Update move" : "Move swimmer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
