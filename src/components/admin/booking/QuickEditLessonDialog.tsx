import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface QuickEditLesson {
  booking_id: string;
  occurrence_id: string;
  occurrence_date: string; // yyyy-MM-dd
  start_time: string; // HH:mm[:ss]
  end_time: string;
  instructor_id: string | null;
  instructor_name: string | null;
  child_name?: string | null;
  parent_name?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lesson: QuickEditLesson | null;
  onSaved?: () => void;
  /** Optional pre-filled new start time (e.g. from drag-to-move). */
  initialStart?: string;
}

const norm = (t: string) => (t || "").slice(0, 5);
const toMin = (t: string) => {
  const [h, m] = norm(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const fromMin = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fmtTime = (t: string) => {
  const [h, m] = norm(t).split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
};

export default function QuickEditLessonDialog({ open, onOpenChange, lesson, onSaved, initialStart }: Props) {
  const [date, setDate] = useState<Date | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [instructorId, setInstructorId] = useState<string>("");
  const [instructors, setInstructors] = useState<{ id: string; name: string }[]>([]);
  const [notify, setNotify] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origLen = useMemo(() => {
    if (!lesson) return 30;
    return Math.max(15, toMin(lesson.end_time) - toMin(lesson.start_time));
  }, [lesson]);

  useEffect(() => {
    if (!open || !lesson) return;
    setDate(parseISO(lesson.occurrence_date));
    setStart(initialStart ? norm(initialStart) : norm(lesson.start_time));
    setEnd(
      initialStart
        ? fromMin(toMin(initialStart) + origLen)
        : norm(lesson.end_time),
    );
    setInstructorId(lesson.instructor_id || "");
    setNotify(true);
    setReason("");
    setError(null);
  }, [open, lesson, initialStart, origLen]);

  useEffect(() => {
    if (!open) return;
    supabase.rpc("get_active_instructors_public").then(({ data }) => {
      setInstructors(((data as any[]) || []).map((i) => ({ id: i.id, name: i.name })));
    });
  }, [open]);

  const onStartChange = (v: string) => {
    setStart(v);
    // auto-shift end to preserve length
    if (v && /^\d{2}:\d{2}$/.test(v)) {
      setEnd(fromMin(toMin(v) + origLen));
    }
  };

  const dirty = useMemo(() => {
    if (!lesson || !date) return false;
    return (
      format(date, "yyyy-MM-dd") !== lesson.occurrence_date ||
      norm(start) !== norm(lesson.start_time) ||
      norm(end) !== norm(lesson.end_time) ||
      instructorId !== (lesson.instructor_id || "")
    );
  }, [lesson, date, start, end, instructorId]);

  const canSave = !!lesson && !!date && !!start && !!end && !!instructorId && dirty;

  const save = async () => {
    if (!lesson || !date) return;
    setError(null);
    if (toMin(end) <= toMin(start)) {
      setError("End time must be after start time.");
      return;
    }
    const inst = instructors.find((i) => i.id === instructorId);
    setBusy(true);
    try {
      const { data, error: invErr } = await supabase.functions.invoke(
        "reschedule-private-lesson-occurrence",
        {
          body: {
            booking_id: lesson.booking_id,
            occurrence_id: lesson.occurrence_id,
            mode: "one",
            new_date: format(date, "yyyy-MM-dd"),
            new_start: norm(start),
            new_end: norm(end),
            new_instructor_id: instructorId,
            new_instructor_name: inst?.name || lesson.instructor_name || "",
            notify,
            reason: reason || undefined,
          },
        },
      );
      if (invErr) throw invErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(notify ? "Lesson updated, parent notified." : "Lesson updated.");
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      setError(e?.message || "Could not update lesson");
    } finally {
      setBusy(false);
    }
  };

  if (!lesson) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit lesson{lesson.child_name ? ` — ${lesson.child_name}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
            <span className="uppercase tracking-wide text-muted-foreground">Currently </span>
            <span className="font-medium">
              {format(parseISO(lesson.occurrence_date), "EEE, MMM d")} ·{" "}
              {fmtTime(lesson.start_time)}–{fmtTime(lesson.end_time)} ·{" "}
              {lesson.instructor_name || "Unassigned"}
            </span>
          </div>

          <div>
            <Label className="text-xs">Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="mt-1 w-full justify-start font-normal">
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  {date ? format(date, "EEE, MMM d, yyyy") : "Pick a date…"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker
                  mode="single"
                  selected={date ?? undefined}
                  onSelect={(d) => d && setDate(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start</Label>
              <Input
                type="time"
                value={start}
                step={300}
                onChange={(e) => onStartChange(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input
                type="time"
                value={end}
                step={300}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Instructor</Label>
            <Select value={instructorId} onValueChange={setInstructorId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Pick instructor" />
              </SelectTrigger>
              <SelectContent>
                {instructors.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Reason (optional, shown in email)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Parent requested earlier time"
              className="mt-1"
              maxLength={500}
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
            <Checkbox checked={notify} onCheckedChange={(v) => setNotify(!!v)} />
            <span>Email parent about this change</span>
          </label>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!canSave || busy}>
            {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
