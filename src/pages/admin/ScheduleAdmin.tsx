import { useEffect, useMemo, useState, useCallback } from "react";
import { format, startOfWeek, addDays, addWeeks, subWeeks, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, Plus, Copy, Send, Settings2, Trash2, Loader2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import PositionsManager from "@/components/admin/schedule/PositionsManager";

interface Instructor { id: string; name: string; is_active: boolean; email: string | null; hourly_wage: number | null; }
interface Position { id: string; name: string; color: string; is_active: boolean; }
interface Shift {
  id: string;
  instructor_id: string | null;
  position_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  color: string | null;
  status: string;
}
interface Publication { week_start: string; published_at: string; }
interface ClassShift {
  key: string;
  instructor_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  title: string;
}
interface TimeOff {
  id: string;
  instructor_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ScheduleAdmin = () => {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [classShifts, setClassShifts] = useState<ClassShift[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [positionsOpen, setPositionsOpen] = useState(false);

  const [shiftDialog, setShiftDialog] = useState<{
    open: boolean;
    editing?: Shift;
    defaults?: { instructor_id: string | null; shift_date: string };
  }>({ open: false });

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [instRes, posRes, shiftRes, pubRes, sessRes, ldRes, ptoRes] = await Promise.all([
      supabase.from("instructors").select("id, name, is_active, email, hourly_wage").eq("is_active", true).order("name"),
      supabase.from("shift_positions").select("*").eq("is_active", true).order("name"),
      supabase.from("shifts").select("*").gte("shift_date", weekStartStr).lte("shift_date", weekEndStr),
      supabase.from("schedule_publications").select("week_start, published_at").eq("week_start", weekStartStr).maybeSingle(),
      supabase.from("swim_sessions")
        .select("id, swim_level, age_group, start_time, end_time, session_name, instructor_id")
        .eq("is_active", true).not("instructor_id", "is", null),
      supabase.from("session_lesson_dates")
        .select("session_id, lesson_date, is_cancelled")
        .gte("lesson_date", weekStartStr).lte("lesson_date", weekEndStr),
      supabase.from("time_off_requests")
        .select("id, instructor_id, start_date, end_date, reason")
        .eq("status", "approved")
        .lte("start_date", weekEndStr).gte("end_date", weekStartStr),
    ]);
    if (instRes.data) setInstructors(instRes.data);
    if (posRes.data) setPositions(posRes.data);
    if (shiftRes.data) setShifts(shiftRes.data);
    setPublication(pubRes.data ?? null);
    setTimeOff((ptoRes.data ?? []) as TimeOff[]);

    // Build read-only "class" shifts from swim sessions + lesson dates
    const sessions = sessRes.data ?? [];
    const dates = (ldRes.data ?? []).filter((d) => !d.is_cancelled);
    const sessById = new Map(sessions.map((s) => [s.id, s]));
    const cs: ClassShift[] = [];
    for (const d of dates) {
      const s = sessById.get(d.session_id);
      if (!s || !s.instructor_id) continue;
      cs.push({
        key: `${s.id}-${d.lesson_date}`,
        instructor_id: s.instructor_id,
        shift_date: d.lesson_date,
        start_time: s.start_time,
        end_time: s.end_time,
        title: s.session_name || `${s.swim_level}${s.age_group ? " · " + s.age_group : ""}`,
      });
    }
    setClassShifts(cs);
    setLoading(false);
  }, [weekStartStr, weekEndStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const shiftsBy = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shifts) {
      const key = `${s.instructor_id ?? "open"}|${s.shift_date}`;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
    return map;
  }, [shifts]);

  const openAdd = (instructorId: string | null, date: Date) =>
    setShiftDialog({
      open: true,
      defaults: { instructor_id: instructorId, shift_date: format(date, "yyyy-MM-dd") },
    });

  const openEdit = (shift: Shift) => setShiftDialog({ open: true, editing: shift });

  const handleSaveShift = async (payload: Partial<Shift>) => {
    if (shiftDialog.editing) {
      const { error } = await supabase.from("shifts").update(payload).eq("id", shiftDialog.editing.id);
      if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const { error } = await supabase.from("shifts").insert(payload as any);
      if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    setShiftDialog({ open: false });
    fetchData();
  };

  const handleDeleteShift = async (id: string) => {
    const { error } = await supabase.from("shifts").delete().eq("id", id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setShiftDialog({ open: false });
    fetchData();
  };

  const handleDragStart = (e: React.DragEvent, shift: Shift) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ id: shift.id, copy: e.altKey || e.metaKey }));
    e.dataTransfer.effectAllowed = "copyMove";
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const handleDrop = async (e: React.DragEvent, instructorId: string | null, date: Date) => {
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
    const shift = shifts.find((s) => s.id === data.id);
    if (!shift) return;
    const newDate = format(date, "yyyy-MM-dd");
    if (e.altKey || e.metaKey || data.copy) {
      const { error } = await supabase.from("shifts").insert({
        instructor_id: instructorId,
        position_id: shift.position_id,
        shift_date: newDate,
        start_time: shift.start_time,
        end_time: shift.end_time,
        notes: shift.notes,
        color: shift.color,
        status: "draft",
      });
      if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const { error } = await supabase
        .from("shifts")
        .update({ instructor_id: instructorId, shift_date: newDate })
        .eq("id", shift.id);
      if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    fetchData();
  };

  const handleCopyPrevWeek = async () => {
    const prevStart = format(subWeeks(weekStart, 1), "yyyy-MM-dd");
    const prevEnd = format(addDays(subWeeks(weekStart, 1), 6), "yyyy-MM-dd");
    const { data, error } = await supabase
      .from("shifts").select("*").gte("shift_date", prevStart).lte("shift_date", prevEnd);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    if (!data?.length) return toast({ title: "Previous week is empty" });
    const rows = data.map((s) => ({
      instructor_id: s.instructor_id,
      position_id: s.position_id,
      shift_date: format(addDays(parseISO(s.shift_date), 7), "yyyy-MM-dd"),
      start_time: s.start_time,
      end_time: s.end_time,
      notes: s.notes,
      color: s.color,
      status: "draft",
    }));
    const { error: insErr } = await supabase.from("shifts").insert(rows);
    if (insErr) return toast({ title: "Error", description: insErr.message, variant: "destructive" });
    toast({ title: `Copied ${rows.length} shifts from last week` });
    fetchData();
  };

  const handlePublish = async () => {
    setPublishing(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("schedule_publications").upsert(
      { week_start: weekStartStr, published_by: userData.user?.id ?? null, published_at: new Date().toISOString() },
      { onConflict: "week_start" },
    );
    if (error) {
      setPublishing(false);
      return toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    await supabase.from("shifts")
      .update({ status: "published" })
      .gte("shift_date", weekStartStr).lte("shift_date", weekEndStr).eq("status", "draft");

    // Fire-and-forget email notification
    try {
      await supabase.functions.invoke("notify-schedule-published", {
        body: { week_start: weekStartStr },
      });
    } catch {/* non-blocking */}

    setPublishing(false);
    toast({ title: "Schedule published", description: "Instructors have been notified." });
    fetchData();
  };

  const positionById = (id: string | null) => positions.find((p) => p.id === id);

  const ptoFor = (instructorId: string | null, dateStr: string) => {
    if (!instructorId) return null;
    return timeOff.find(
      (p) => p.instructor_id === instructorId && p.start_date <= dateStr && p.end_date >= dateStr,
    ) ?? null;
  };

  const renderCell = (instructorId: string | null, date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const key = `${instructorId ?? "open"}|${dateStr}`;
    const cellShifts = shiftsBy.get(key) ?? [];
    const cellClasses = instructorId
      ? classShifts.filter((c) => c.instructor_id === instructorId && c.shift_date === dateStr)
      : [];
    const isEmpty = cellShifts.length === 0 && cellClasses.length === 0;
    const pto = ptoFor(instructorId, dateStr);
    return (
      <div
        className={`relative min-h-[80px] border-l p-1 space-y-1 hover:bg-muted/30 transition-colors ${pto ? "bg-rose-50/40" : ""}`}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, instructorId, date)}
        onClick={(e) => {
          if (e.target === e.currentTarget) openAdd(instructorId, date);
        }}
        title={pto ? `Approved time off${pto.reason ? `: ${pto.reason}` : ""}` : undefined}
      >
        {pto && (
          <>
            <div className="absolute inset-y-0 left-0 w-1 bg-rose-500 pointer-events-none" />
            <div className="absolute top-1 right-1 text-[9px] font-semibold text-rose-700 bg-rose-100 px-1 rounded pointer-events-none uppercase tracking-wide">
              PTO
            </div>
          </>
        )}
        {cellClasses.map((c) => (
          <div
            key={c.key}
            className="rounded px-2 py-1 text-xs text-white shadow-sm border border-white/30 opacity-90"
            style={{ backgroundColor: "#0ea5e9" }}
            title="Auto-pulled from swim sessions (read-only)"
          >
            <div className="font-semibold">{c.start_time.slice(0, 5)}–{c.end_time.slice(0, 5)}</div>
            <div className="opacity-90 truncate">📚 {c.title}</div>
          </div>
        ))}
        {cellShifts.map((s) => {
          const pos = positionById(s.position_id);
          const color = s.color || pos?.color || "#2a5e84";
          return (
            <div
              key={s.id}
              draggable
              onDragStart={(e) => handleDragStart(e, s)}
              onClick={(e) => { e.stopPropagation(); openEdit(s); }}
              className="rounded px-2 py-1 text-xs text-white cursor-grab active:cursor-grabbing shadow-sm"
              style={{ backgroundColor: color }}
              title={s.notes || ""}
            >
              <div className="font-semibold">
                {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
              </div>
              {pos && <div className="opacity-90 truncate">{pos.name}</div>}
            </div>
          );
        })}
        {isEmpty && !pto && (
          <button
            className="text-xs text-muted-foreground/60 hover:text-foreground w-full h-full text-left"
            onClick={() => openAdd(instructorId, date)}
          >
            +
          </button>
        )}
      </div>
    );
  };

  const totalHours = (instructorId: string | null) => {
    let mins = 0;
    for (const s of shifts) {
      if (s.instructor_id !== instructorId) continue;
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      mins += (eh * 60 + em) - (sh * 60 + sm);
    }
    return (mins / 60).toFixed(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Schedule</h1>
          <p className="text-sm text-muted-foreground">
            Week of {format(weekStart, "MMM d, yyyy")}
            {publication && (
              <Badge variant="secondary" className="ml-2">
                Published {format(parseISO(publication.published_at), "MMM d 'at' h:mm a")}
              </Badge>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyPrevWeek}>
            <Copy className="h-4 w-4 mr-1" /> Copy last week
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPositionsOpen(true)}>
            <Settings2 className="h-4 w-4 mr-1" /> Positions
          </Button>
          <Button size="sm" onClick={handlePublish} disabled={publishing}>
            {publishing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Publish week
          </Button>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Header row */}
          <div className="grid grid-cols-[180px_repeat(7,1fr)] border-b sticky top-0 bg-card z-10">
            <div className="p-2 text-xs font-medium text-muted-foreground">Instructor</div>
            {days.map((d, i) => (
              <div key={i} className="p-2 border-l text-xs">
                <div className="font-medium">{DAY_LABELS[i]}</div>
                <div className="text-muted-foreground">{format(d, "MMM d")}</div>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin inline" /> Loading…
            </div>
          ) : (
            <>
              {/* Open shifts row */}
              <div className="grid grid-cols-[180px_repeat(7,1fr)] border-b bg-muted/20">
                <div className="p-2 text-sm">
                  <div className="font-medium">Open shifts</div>
                  <div className="text-xs text-muted-foreground">Unassigned</div>
                </div>
                {days.map((d, i) => <div key={i}>{renderCell(null, d)}</div>)}
              </div>

              {/* Instructor rows */}
              {instructors.map((inst) => (
                <div key={inst.id} className="grid grid-cols-[180px_repeat(7,1fr)] border-b">
                  <div className="p-2 text-sm">
                    <div className="font-medium">{inst.name}</div>
                    <div className="text-xs text-muted-foreground">{totalHours(inst.id)} hrs</div>
                  </div>
                  {days.map((d, i) => <div key={i}>{renderCell(inst.id, d)}</div>)}
                </div>
              ))}

              {instructors.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No active instructors. Add some in the Instructors page first.
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Tip: Click an empty cell to add a shift. Drag a shift to move it. Hold ⌥/Alt while dragging to copy.
      </p>

      <ShiftDialog
        state={shiftDialog}
        instructors={instructors}
        positions={positions}
        onClose={() => setShiftDialog({ open: false })}
        onSave={handleSaveShift}
        onDelete={handleDeleteShift}
      />

      <PositionsManager open={positionsOpen} onOpenChange={setPositionsOpen} onChanged={fetchData} />
    </div>
  );
};

// ---------- Shift dialog ----------

function ShiftDialog({
  state, instructors, positions, onClose, onSave, onDelete,
}: {
  state: { open: boolean; editing?: Shift; defaults?: { instructor_id: string | null; shift_date: string } };
  instructors: Instructor[];
  positions: Position[];
  onClose: () => void;
  onSave: (p: Partial<Shift>) => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState({
    instructor_id: "",
    position_id: "",
    shift_date: "",
    start_time: "09:00",
    end_time: "12:00",
    notes: "",
  });

  useEffect(() => {
    if (state.editing) {
      setForm({
        instructor_id: state.editing.instructor_id ?? "open",
        position_id: state.editing.position_id ?? "",
        shift_date: state.editing.shift_date,
        start_time: state.editing.start_time.slice(0, 5),
        end_time: state.editing.end_time.slice(0, 5),
        notes: state.editing.notes ?? "",
      });
    } else if (state.defaults) {
      setForm((f) => ({
        ...f,
        instructor_id: state.defaults!.instructor_id ?? "open",
        shift_date: state.defaults!.shift_date,
      }));
    }
  }, [state.editing, state.defaults, state.open]);

  const submit = () => {
    if (!form.shift_date || !form.start_time || !form.end_time) return;
    onSave({
      instructor_id: form.instructor_id === "open" ? null : form.instructor_id,
      position_id: form.position_id || null,
      shift_date: form.shift_date,
      start_time: form.start_time,
      end_time: form.end_time,
      notes: form.notes || null,
    });
  };

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state.editing ? "Edit shift" : "Add shift"}</DialogTitle>
          <DialogDescription>Assign a time block to an instructor or leave open.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Instructor</Label>
            <Select value={form.instructor_id} onValueChange={(v) => setForm({ ...form, instructor_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open shift (unassigned)</SelectItem>
                {instructors.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Position</Label>
            <Select value={form.position_id} onValueChange={(v) => setForm({ ...form, position_id: v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {positions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: p.color }} />
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={form.shift_date} onChange={(e) => setForm({ ...form, shift_date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Start</Label>
              <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div>
              <Label>End</Label>
              <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {state.editing ? (
            <Button variant="destructive" size="sm" onClick={() => onDelete(state.editing!.id)}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={submit}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ScheduleAdmin;
