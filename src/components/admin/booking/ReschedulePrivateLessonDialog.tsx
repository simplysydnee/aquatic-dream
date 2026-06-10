import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAvailableSlots } from "@/hooks/useAvailableSlots";


type Mode = "one" | "remaining" | "instructor";

interface OccurrenceLite {
  id: string;
  occurrence_date: string;
  status: string;
  start_time_override?: string | null;
  end_time_override?: string | null;
  instructor_override_id?: string | null;
  instructor_override_name?: string | null;
}

interface BookingLite {
  id: string;
  child_name?: string | null;
  parent_name?: string | null;
  instructor_id?: string | null;
  instructor_name?: string | null;
  start_time: string;
  end_time: string;
  lesson_booking_occurrences?: OccurrenceLite[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  booking: BookingLite | null;
  /** Pre-selected occurrence (when admin clicked Reschedule on a single row). */
  initialOccurrenceId?: string;
  /** Force the dialog to open in "remaining" mode (from the footer button). */
  initialMode?: Mode;
  onDone?: () => void;
}

const norm = (t: string) => t.slice(0, 5);
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const fromMin = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fmtTime = (t: string) => {
  const [h, m] = norm(t).split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
};

const ReschedulePrivateLessonDialog = ({
  open,
  onOpenChange,
  booking,
  initialOccurrenceId,
  initialMode = "one",
  onDone,
}: Props) => {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [occurrenceId, setOccurrenceId] = useState<string>(initialOccurrenceId || "");
  const [date, setDate] = useState<Date | null>(null);
  const [chosenSlot, setChosenSlot] = useState<{ instructorId: string; instructorName: string; start: string; end: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset when reopened
  useMemo(() => {
    if (open) {
      setMode(initialMode);
      setOccurrenceId(initialOccurrenceId || (booking?.lesson_booking_occurrences?.find((o) => o.status !== "cancelled")?.id ?? ""));
      setDate(null);
      setChosenSlot(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMode, initialOccurrenceId, booking?.id]);

  const baseStart = booking ? norm(booking.start_time) : "00:00";
  const baseEnd = booking ? norm(booking.end_time) : "00:00";
  const lengthMin = booking ? toMin(baseEnd) - toMin(baseStart) : 60;

  const activeOccurrences = (booking?.lesson_booking_occurrences || [])
    .filter((o) => o.status !== "cancelled")
    .sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date));

  const selectedOcc = activeOccurrences.find((o) => o.id === occurrenceId) || null;

  const { slots, loading: loadingSlots, hasAnyShift } = useAvailableSlots(date, {
    lengthMin,
    stepMin: 15,
    poolArea: "shallow",
  });

  // For "instructor" mode, list only instructors with a shift covering the existing slot.
  const occDate = selectedOcc ? parseISO(selectedOcc.occurrence_date) : null;
  const { slots: instructorOnlySlots } = useAvailableSlots(
    mode === "instructor" ? occDate : null,
    { lengthMin, stepMin: 15, poolArea: "shallow" },
  );
  const instructorOptions = useMemo(() => {
    if (mode !== "instructor" || !selectedOcc) return [] as { id: string; name: string }[];
    const occStart = norm(selectedOcc.start_time_override || baseStart);
    const occEnd = norm(selectedOcc.end_time_override || baseEnd);
    const oS = toMin(occStart);
    const oE = toMin(occEnd);
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const s of instructorOnlySlots) {
      const sS = toMin(s.start);
      const sE = toMin(s.end);
      // slot covers occ window
      if (sS <= oS && sE >= oE && !seen.has(s.instructorId)) {
        seen.add(s.instructorId);
        out.push({ id: s.instructorId, name: s.instructorName });
      }
    }
    return out;
  }, [mode, selectedOcc, baseStart, baseEnd, instructorOnlySlots]);

  const canSubmit = !!booking && !!selectedOcc && (
    mode === "instructor"
      ? !!chosenSlot
      : mode === "one"
        ? !!date && !!chosenSlot
        : !!date && !!chosenSlot
  );

  const submit = async () => {
    if (!booking || !selectedOcc) return;
    setBusy(true);
    try {
      const env = getStripeEnvironment();
      const payload: any = {
        booking_id: booking.id,
        mode,
        notify: true,
      };
      if (mode === "one") {
        payload.occurrence_id = selectedOcc.id;
        payload.new_date = format(date!, "yyyy-MM-dd");
        payload.new_start = chosenSlot!.start;
        payload.new_end = chosenSlot!.end;
        payload.new_instructor_id = chosenSlot!.instructorId;
        payload.new_instructor_name = chosenSlot!.instructorName;
      } else if (mode === "remaining") {
        payload.new_date = format(date!, "yyyy-MM-dd");
        payload.new_start = chosenSlot!.start;
        payload.new_end = chosenSlot!.end;
        payload.new_instructor_id = chosenSlot!.instructorId;
        payload.new_instructor_name = chosenSlot!.instructorName;
      } else {
        payload.occurrence_id = selectedOcc.id;
        payload.new_instructor_id = chosenSlot!.instructorId;
        payload.new_instructor_name = chosenSlot!.instructorName;
      }

      const { data, error } = await supabase.functions.invoke(
        "reschedule-private-lesson-occurrence",
        { body: payload },
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({
        title: "Rescheduled",
        description:
          mode === "remaining"
            ? `Moved ${(data as any)?.moved ?? "all"} remaining lessons.`
            : "Lesson moved and parent notified.",
      });
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast({ title: "Couldn't reschedule", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Reschedule lesson{booking?.child_name ? ` — ${booking.child_name}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={mode} onValueChange={(v) => { setMode(v as Mode); setDate(null); setChosenSlot(null); }} className="grid gap-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <RadioGroupItem value="one" id="m-one" className="mt-1" />
              <span className="text-sm">
                <strong>This occurrence only</strong>
                <span className="block text-xs text-muted-foreground">Pick a new date & open slot.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <RadioGroupItem value="remaining" id="m-rem" className="mt-1" />
              <span className="text-sm">
                <strong>All remaining lessons</strong>
                <span className="block text-xs text-muted-foreground">Re-lay the rest of the series onto a new weekly slot.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <RadioGroupItem value="instructor" id="m-inst" className="mt-1" />
              <span className="text-sm">
                <strong>Change instructor only</strong>
                <span className="block text-xs text-muted-foreground">Keep the same date & time, just swap instructors.</span>
              </span>
            </label>
          </RadioGroup>

          {(mode === "one" || mode === "instructor") && (
            <div>
              <Label className="text-xs">Which lesson?</Label>
              <select
                value={occurrenceId}
                onChange={(e) => { setOccurrenceId(e.target.value); setChosenSlot(null); }}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {activeOccurrences.map((o) => (
                  <option key={o.id} value={o.id}>
                    {format(parseISO(o.occurrence_date), "EEE, MMM d")} · {fmtTime(o.start_time_override || baseStart)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(mode === "one" || mode === "remaining") && (
            <div>
              <Label className="text-xs">
                {mode === "remaining" ? "New weekly start date" : "New date"}
              </Label>
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
                    onSelect={(d) => { setDate(d ?? null); setChosenSlot(null); }}
                    disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {(mode === "one" || mode === "remaining") && date && (
            <div>
              <Label className="text-xs">Open slots ({lengthMin}-min)</Label>
              {loadingSlots ? (
                <p className="text-xs text-muted-foreground mt-2">
                  <Loader2 className="w-3 h-3 inline animate-spin mr-1" /> Looking for openings…
                </p>
              ) : slots.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-2">
                  {hasAnyShift
                    ? "No open slots on that day for a lesson of this length."
                    : "No instructor shifts published for that date."}
                </p>
              ) : (
                <div className="mt-1 max-h-56 overflow-y-auto rounded-md border border-border divide-y">
                  {slots.map((s, i) => {
                    const isSel = chosenSlot
                      && chosenSlot.instructorId === s.instructorId
                      && chosenSlot.start === s.start;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setChosenSlot({
                          instructorId: s.instructorId,
                          instructorName: s.instructorName,
                          start: s.start,
                          end: s.end,
                        })}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted",
                          isSel && "bg-primary/10",
                        )}
                      >
                        <span>{fmtTime(s.start)} – {fmtTime(s.end)}</span>
                        <span className="text-xs text-muted-foreground">{s.instructorName}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {mode === "instructor" && selectedOcc && (
            <div>
              <Label className="text-xs">Pick new instructor (must already have a shift covering this slot)</Label>
              {instructorOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-2">
                  No other instructors have a published shift covering this lesson time.
                </p>
              ) : (
                <div className="mt-1 max-h-56 overflow-y-auto rounded-md border border-border divide-y">
                  {instructorOptions
                    .filter((i) => i.name !== (booking?.instructor_name || ""))
                    .map((i) => {
                      const isSel = chosenSlot?.instructorId === i.id;
                      return (
                        <button
                          key={i.id}
                          type="button"
                          onClick={() => setChosenSlot({
                            instructorId: i.id,
                            instructorName: i.name,
                            start: norm(selectedOcc.start_time_override || baseStart),
                            end: norm(selectedOcc.end_time_override || baseEnd),
                          })}
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm hover:bg-muted",
                            isSel && "bg-primary/10",
                          )}
                        >
                          {i.name}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={!canSubmit || busy}>
              {busy ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…</> : "Reschedule & notify"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReschedulePrivateLessonDialog;
