import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon, Loader2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAvailableBlockSlots } from "@/hooks/useAvailableBlockSlots";

type Mode = "one" | "remaining" | "instructor";
type BlockKind = "one_off" | "weekly";

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
  initialOccurrenceId?: string;
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
  const [chosenSlot, setChosenSlot] = useState<
    { instructorId: string; instructorName: string; start: string; end: string } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [slotTab, setSlotTab] = useState<"existing" | "create">("existing");
  const [instructors, setInstructors] = useState<{ id: string; name: string }[]>([]);

  // Inline "create block" form state
  const [newBlock, setNewBlock] = useState<{
    instructorId: string;
    kind: BlockKind;
    startTime: string;
    endTime: string;
    weeklyStart: string;
    weeklyEnd: string;
    poolArea: string;
  }>({
    instructorId: "",
    kind: "one_off",
    startTime: "09:00",
    endTime: "10:00",
    weeklyStart: "",
    weeklyEnd: "",
    poolArea: "shallow",
  });
  const [creatingBlock, setCreatingBlock] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setOccurrenceId(
      initialOccurrenceId ||
        (booking?.lesson_booking_occurrences?.find((o) => o.status !== "cancelled")?.id ?? ""),
    );
    setDate(null);
    setChosenSlot(null);
    setSlotTab("existing");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMode, initialOccurrenceId, booking?.id]);

  useEffect(() => {
    if (!open) return;
    supabase.rpc("get_active_instructors_public").then(({ data }) => {
      setInstructors(((data as any[]) || []).map((i) => ({ id: i.id, name: i.name })));
    });
  }, [open]);

  const baseStart = booking ? norm(booking.start_time) : "00:00";
  const baseEnd = booking ? norm(booking.end_time) : "00:00";
  const lengthMin = booking ? toMin(baseEnd) - toMin(baseStart) : 60;

  const activeOccurrences = (booking?.lesson_booking_occurrences || [])
    .filter((o) => o.status !== "cancelled")
    .sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date));

  const selectedOcc = activeOccurrences.find((o) => o.id === occurrenceId) || null;

  const remainingFromSelected = useMemo(() => {
    if (!selectedOcc) return 0;
    return activeOccurrences.filter(
      (o) => o.occurrence_date >= selectedOcc.occurrence_date,
    ).length;
  }, [activeOccurrences, selectedOcc]);

  const { slots, loading: loadingSlots, hasAnyBlock, refresh } = useAvailableBlockSlots(
    mode === "one" || mode === "remaining" ? date : null,
    { lengthMin, stepMin: 15, poolArea: "shallow" },
  );

  // For "instructor only" mode: list instructors whose block covers the existing slot
  const occDate = selectedOcc ? parseISO(selectedOcc.occurrence_date) : null;
  const { slots: instructorBlockSlots } = useAvailableBlockSlots(
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
    for (const s of instructorBlockSlots) {
      const sS = toMin(s.start);
      const sE = toMin(s.end);
      if (sS <= oS && sE >= oE && !seen.has(s.instructorId)) {
        seen.add(s.instructorId);
        out.push({ id: s.instructorId, name: s.instructorName });
      }
    }
    return out;
  }, [mode, selectedOcc, baseStart, baseEnd, instructorBlockSlots]);

  // Seed the create-block form defaults whenever the dialog/date changes
  useEffect(() => {
    if (!open || !booking) return;
    setNewBlock((nb) => ({
      ...nb,
      instructorId: nb.instructorId || booking.instructor_id || "",
      startTime: baseStart,
      endTime: baseEnd,
    }));
  }, [open, booking, baseStart, baseEnd]);

  const canSubmit = !!booking && !!selectedOcc && (
    mode === "instructor"
      ? !!chosenSlot
      : !!date && !!chosenSlot
  );

  const createBlock = async () => {
    if (!date) {
      toast({ title: "Pick a date first", variant: "destructive" });
      return;
    }
    if (!newBlock.instructorId) {
      toast({ title: "Choose an instructor", variant: "destructive" });
      return;
    }
    if (toMin(newBlock.endTime) - toMin(newBlock.startTime) < lengthMin) {
      toast({
        title: "Window too short",
        description: `Block must be at least ${lengthMin} minutes long.`,
        variant: "destructive",
      });
      return;
    }
    setCreatingBlock(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const dow = date.getDay();
      const insertRow: any = {
        instructor_id: newBlock.instructorId,
        kind: newBlock.kind === "weekly" ? "weekly" : "date_range",
        start_time: newBlock.startTime,
        end_time: newBlock.endTime,
        slot_minutes: lengthMin,
        pool_area: newBlock.poolArea,
        is_blackout: false,
        day_of_week: dow,
      };
      if (newBlock.kind === "weekly") {
        insertRow.start_date = newBlock.weeklyStart || dateStr;
        insertRow.end_date = newBlock.weeklyEnd || null;
      } else {
        insertRow.start_date = dateStr;
        insertRow.end_date = dateStr;
      }
      const { error } = await supabase.from("instructor_booking_blocks").insert(insertRow);
      if (error) throw error;
      toast({ title: "Block created", description: "Pick the new slot below." });
      setSlotTab("existing");
      refresh();
      // auto-select the matching slot once it appears
      const inst = instructors.find((i) => i.id === newBlock.instructorId);
      setChosenSlot({
        instructorId: newBlock.instructorId,
        instructorName: inst?.name || "Instructor",
        start: newBlock.startTime,
        end: fromMin(toMin(newBlock.startTime) + lengthMin),
      });
    } catch (e: any) {
      toast({ title: "Couldn't create block", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setCreatingBlock(false);
    }
  };

  const submit = async () => {
    if (!booking || !selectedOcc) return;
    setBusy(true);
    try {
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

  const currentSummary = selectedOcc
    ? `${format(parseISO(selectedOcc.occurrence_date), "EEE, MMM d, yyyy")} · ${fmtTime(
        selectedOcc.start_time_override || baseStart,
      )}–${fmtTime(selectedOcc.end_time_override || baseEnd)} · ${
        selectedOcc.instructor_override_name || booking?.instructor_name || "Instructor"
      }`
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Reschedule lesson{booking?.child_name ? ` — ${booking.child_name}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {currentSummary && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {mode === "remaining"
                  ? `Currently — moving ${remainingFromSelected} lesson${remainingFromSelected === 1 ? "" : "s"} starting`
                  : "Currently"}
              </div>
              <div className="font-medium">{currentSummary}</div>
            </div>
          )}

          <RadioGroup
            value={mode}
            onValueChange={(v) => {
              setMode(v as Mode);
              setDate(null);
              setChosenSlot(null);
            }}
            className="grid gap-2"
          >
            <label className="flex items-start gap-2 cursor-pointer">
              <RadioGroupItem value="one" id="m-one" className="mt-1" />
              <span className="text-sm">
                <strong>This occurrence only</strong>
                <span className="block text-xs text-muted-foreground">
                  Pick a new date & open slot.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <RadioGroupItem value="remaining" id="m-rem" className="mt-1" />
              <span className="text-sm">
                <strong>All remaining lessons</strong>
                <span className="block text-xs text-muted-foreground">
                  Re-lay the rest of the series onto a new weekly slot.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <RadioGroupItem value="instructor" id="m-inst" className="mt-1" />
              <span className="text-sm">
                <strong>Change instructor only</strong>
                <span className="block text-xs text-muted-foreground">
                  Keep the same date & time, just swap instructors.
                </span>
              </span>
            </label>
          </RadioGroup>

          {(mode === "one" || mode === "instructor") && (
            <div>
              <Label className="text-xs">Which lesson?</Label>
              <select
                value={occurrenceId}
                onChange={(e) => {
                  setOccurrenceId(e.target.value);
                  setChosenSlot(null);
                }}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {activeOccurrences.map((o) => (
                  <option key={o.id} value={o.id}>
                    {format(parseISO(o.occurrence_date), "EEE, MMM d")} ·{" "}
                    {fmtTime(o.start_time_override || baseStart)}
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
                    onSelect={(d) => {
                      setDate(d ?? null);
                      setChosenSlot(null);
                    }}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {(mode === "one" || mode === "remaining") && date && (
            <div>
              <Tabs value={slotTab} onValueChange={(v) => setSlotTab(v as any)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="existing">Open slots</TabsTrigger>
                  <TabsTrigger value="create">
                    <Plus className="w-3 h-3 mr-1" />
                    New block
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="existing" className="mt-3">
                  <Label className="text-xs">
                    Open private-lesson slots ({lengthMin}-min)
                  </Label>
                  {loadingSlots ? (
                    <p className="text-xs text-muted-foreground mt-2">
                      <Loader2 className="w-3 h-3 inline animate-spin mr-1" /> Looking for openings…
                    </p>
                  ) : slots.length === 0 ? (
                    <p className="text-xs text-muted-foreground mt-2">
                      {hasAnyBlock
                        ? "No open slots inside existing blocks for this lesson length."
                        : "No private-lesson blocks created for that day — create one in the next tab."}
                    </p>
                  ) : (
                    <div className="mt-1 max-h-56 overflow-y-auto rounded-md border border-border divide-y">
                      {slots.map((s, i) => {
                        const isSel =
                          chosenSlot &&
                          chosenSlot.instructorId === s.instructorId &&
                          chosenSlot.start === s.start;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() =>
                              setChosenSlot({
                                instructorId: s.instructorId,
                                instructorName: s.instructorName,
                                start: s.start,
                                end: s.end,
                              })
                            }
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted",
                              isSel && "bg-primary/10",
                            )}
                          >
                            <span>
                              {fmtTime(s.start)} – {fmtTime(s.end)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {s.instructorName}
                              {s.blockNotes ? ` · ${s.blockNotes}` : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="create" className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Create a new booking block on{" "}
                    <strong>{format(date, "EEE, MMM d")}</strong>. After it's
                    created, the slot is auto-selected below.
                  </p>

                  <div>
                    <Label className="text-xs">Instructor</Label>
                    <select
                      value={newBlock.instructorId}
                      onChange={(e) =>
                        setNewBlock({ ...newBlock, instructorId: e.target.value })
                      }
                      className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">Select instructor…</option>
                      {instructors.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs">Block type</Label>
                    <RadioGroup
                      value={newBlock.kind}
                      onValueChange={(v) =>
                        setNewBlock({ ...newBlock, kind: v as BlockKind })
                      }
                      className="mt-1 grid grid-cols-2 gap-2"
                    >
                      <label className="flex items-center gap-2 cursor-pointer rounded-md border border-input px-2 py-1.5 text-sm">
                        <RadioGroupItem value="one_off" />
                        One-off (this date)
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer rounded-md border border-input px-2 py-1.5 text-sm">
                        <RadioGroupItem value="weekly" />
                        Weekly recurring
                      </label>
                    </RadioGroup>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Start time</Label>
                      <Input
                        type="time"
                        value={newBlock.startTime}
                        onChange={(e) =>
                          setNewBlock({ ...newBlock, startTime: e.target.value })
                        }
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">End time</Label>
                      <Input
                        type="time"
                        value={newBlock.endTime}
                        onChange={(e) =>
                          setNewBlock({ ...newBlock, endTime: e.target.value })
                        }
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>

                  {newBlock.kind === "weekly" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Recurs from</Label>
                        <Input
                          type="date"
                          value={newBlock.weeklyStart || format(date, "yyyy-MM-dd")}
                          onChange={(e) =>
                            setNewBlock({ ...newBlock, weeklyStart: e.target.value })
                          }
                          className="mt-1 h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Recurs until (optional)</Label>
                        <Input
                          type="date"
                          value={newBlock.weeklyEnd}
                          onChange={(e) =>
                            setNewBlock({ ...newBlock, weeklyEnd: e.target.value })
                          }
                          className="mt-1 h-9"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">Pool area</Label>
                    <select
                      value={newBlock.poolArea}
                      onChange={(e) =>
                        setNewBlock({ ...newBlock, poolArea: e.target.value })
                      }
                      className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="shallow">Shallow</option>
                      <option value="deep">Deep</option>
                      <option value="full">Full pool</option>
                    </select>
                  </div>

                  <Button
                    type="button"
                    onClick={createBlock}
                    disabled={creatingBlock}
                    className="w-full"
                  >
                    {creatingBlock ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Creating…
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-1" /> Create block
                      </>
                    )}
                  </Button>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {mode === "instructor" && selectedOcc && (
            <div>
              <Label className="text-xs">
                Pick new instructor (must have a block covering this slot)
              </Label>
              {instructorOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-2">
                  No other instructors have a private-lesson block covering this time.
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
                          onClick={() =>
                            setChosenSlot({
                              instructorId: i.id,
                              instructorName: i.name,
                              start: norm(selectedOcc.start_time_override || baseStart),
                              end: norm(selectedOcc.end_time_override || baseEnd),
                            })
                          }
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
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!canSubmit || busy}>
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…
                </>
              ) : (
                "Reschedule & notify"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReschedulePrivateLessonDialog;
