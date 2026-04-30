import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { LEVEL_DISPLAY, LEVEL_BADGE_COLORS, type SwimLevel } from "@/components/swim-enrollment/types";
import { Plus, Pencil, Copy, Loader2, CalendarIcon, ToggleLeft, ToggleRight, Clock, Users, CalendarDays, Trash2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ManageDatesModal from "@/components/admin/ManageDatesModal";

interface Session {
  id: string;
  session_name: string | null;
  session_start_date: string | null;
  session_end_date: string | null;
  start_time: string;
  end_time: string;
  day_of_week: string;
  swim_level: string;
  age_group: string | null;
  max_students: number;
  is_active: boolean;
  instructor_id: string | null;
  registration_status: string;
  session_period_id: string | null;
}

interface SessionPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface Instructor {
  id: string;
  name: string;
}

interface SlotGroup {
  key: string;
  sessions: Session[];
  levels: string[];
  first: Session;
}

interface TimeSlot {
  start: string;
  end: string;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ALL_LEVELS: SwimLevel[] = ["white", "red", "yellow", "blue", "green"];

// Auto-derive session_name from level
const LEVEL_TO_GROUP: Record<string, string> = {
  white: "Little Fins",
  red: "Reef Explorers",
  yellow: "Sea Scouts",
  blue: "Deep Sea Divers",
  green: "Ocean Masters",
};

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start || !end) return "No dates set";
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
}

function formatDayLabel(dow: string) {
  const map: Record<string, string> = {
    monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
    friday: "Fri", saturday: "Sat", sunday: "Sun",
    monday_wednesday: "Mon & Wed", tuesday_thursday: "Tue & Thu",
  };
  return map[dow] || dow;
}

const LEVEL_BORDER: Record<string, string> = {
  white: "border-l-gray-400",
  red: "border-l-red-400",
  yellow: "border-l-yellow-400",
  blue: "border-l-blue-400",
  green: "border-l-green-400",
};


const SessionsAdmin = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [periods, setPeriods] = useState<SessionPeriod[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgeGroup, setFilterAgeGroup] = useState<string>("all");
  const [manageDatesOpen, setManageDatesOpen] = useState(false);
  const [manageDatesSlot, setManageDatesSlot] = useState<{ sessionIds: string[]; startDate: string; endDate: string; label: string; daysOfWeek: string } | null>(null);

  // Session (period) management
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState({ name: "", start_date: undefined as Date | undefined, end_date: undefined as Date | undefined });

  // Edit single class dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    session_period_id: "",
    day_of_week: "",
    start_time: "",
    end_time: "",
    swim_level: "white",
    age_group: "preschool-3-5",
    max_students: "3",
    instructor_id: "",
    registration_status: "open",
  });

  // Create Classes dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    session_period_id: "",
    timeSlots: [{ start: "", end: "" }] as TimeSlot[],
    swim_levels: [] as string[],
    age_group: "preschool-3-5",
    max_students: "3",
    days: [] as string[],
    instructor_id: "",
    frequency: "weekly" as "weekly" | "twice_weekly",
  });

  const fetchData = async () => {
    const [sessRes, instrRes, periodRes] = await Promise.all([
      supabase.from("swim_sessions").select("*").order("start_time"),
      supabase.from("instructors").select("id, name").eq("is_active", true).order("name"),
      supabase.from("session_periods").select("*").order("start_date"),
    ]);
    if (sessRes.data) setSessions(sessRes.data as Session[]);
    if (instrRes.data) setInstructors(instrRes.data);
    if (periodRes.data) setPeriods(periodRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // --- Session (period) CRUD ---
  const resetSessionForm = () => {
    setSessionForm({ name: "", start_date: undefined, end_date: undefined });
    setEditingSessionId(null);
  };

  const handleSaveSession = async () => {
    if (!sessionForm.name || !sessionForm.start_date || !sessionForm.end_date) {
      toast({ title: "Missing fields", description: "Name and dates are required", variant: "destructive" });
      return;
    }
    const payload = {
      name: sessionForm.name,
      start_date: format(sessionForm.start_date, "yyyy-MM-dd"),
      end_date: format(sessionForm.end_date, "yyyy-MM-dd"),
    };
    if (editingSessionId) {
      const { error } = await supabase.from("session_periods").update(payload).eq("id", editingSessionId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Session updated" });
    } else {
      const { error } = await supabase.from("session_periods").insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Session created" });
    }
    setSessionDialogOpen(false);
    resetSessionForm();
    fetchData();
  };

  const deleteSession = async (id: string) => {
    const linked = sessions.filter(s => s.session_period_id === id);
    if (linked.length > 0) {
      toast({ title: "Cannot delete", description: `${linked.length} classes are linked to this session`, variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("session_periods").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Session deleted" });
    fetchData();
  };

  // --- Create Classes (bulk) ---
  const resetCreateForm = () => {
    setCreateForm({
      session_period_id: "",
      timeSlots: [{ start: "", end: "" }],
      swim_levels: [],
      age_group: "preschool-3-5",
      max_students: "3",
      days: [],
      instructor_id: "",
      frequency: "weekly",
    });
  };

  const addTimeSlot = () => {
    setCreateForm(f => ({ ...f, timeSlots: [...f.timeSlots, { start: "", end: "" }] }));
  };

  const removeTimeSlot = (idx: number) => {
    setCreateForm(f => ({ ...f, timeSlots: f.timeSlots.filter((_, i) => i !== idx) }));
  };

  const updateTimeSlot = (idx: number, field: "start" | "end", value: string) => {
    setCreateForm(f => ({
      ...f,
      timeSlots: f.timeSlots.map((ts, i) => i === idx ? { ...ts, [field]: value } : ts),
    }));
  };

  const toggleCreateLevel = (lvl: string) => {
    setCreateForm(f => ({
      ...f,
      swim_levels: f.swim_levels.includes(lvl) ? f.swim_levels.filter(l => l !== lvl) : [...f.swim_levels, lvl],
    }));
  };

  const toggleCreateDay = (day: string) => {
    setCreateForm(f => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter(d => d !== day) : [...f.days, day],
    }));
  };

  const handleCreateClasses = async () => {
    const { session_period_id, timeSlots, swim_levels, age_group, max_students, days, instructor_id, frequency } = createForm;

    if (!session_period_id) { toast({ title: "Select a session", variant: "destructive" }); return; }
    if (timeSlots.some(ts => !ts.start || !ts.end)) { toast({ title: "Fill in all time slots", variant: "destructive" }); return; }
    if (swim_levels.length === 0) { toast({ title: "Select at least one level", variant: "destructive" }); return; }
    if (days.length === 0) { toast({ title: "Select at least one day", variant: "destructive" }); return; }
    if (frequency === "twice_weekly" && days.length < 2) { toast({ title: "Select at least 2 days for 2x/week", variant: "destructive" }); return; }

    const period = periods.find(p => p.id === session_period_id);
    const dayMap: Record<string, number> = {
      Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
    };

    let rows: any[];

    if (frequency === "twice_weekly") {
      // Combine days into one day_of_week string, one class per time slot per level
      const combinedDay = days.map(d => d.toLowerCase()).join("_");
      rows = timeSlots.flatMap(ts =>
        swim_levels.map(lvl => ({
          session_name: LEVEL_TO_GROUP[lvl] || lvl,
          session_period_id,
          session_start_date: period?.start_date || null,
          session_end_date: period?.end_date || null,
          start_time: ts.start,
          end_time: ts.end,
          day_of_week: combinedDay,
          swim_level: lvl,
          age_group,
          max_students: parseInt(max_students) || 3,
          instructor_id: instructor_id || null,
          registration_status: "open",
        }))
      );
    } else {
      // Weekly: separate class per day
      rows = days.flatMap(day =>
        timeSlots.flatMap(ts =>
          swim_levels.map(lvl => ({
            session_name: LEVEL_TO_GROUP[lvl] || lvl,
            session_period_id,
            session_start_date: period?.start_date || null,
            session_end_date: period?.end_date || null,
            start_time: ts.start,
            end_time: ts.end,
            day_of_week: day,
            swim_level: lvl,
            age_group,
            max_students: parseInt(max_students) || 3,
            instructor_id: instructor_id || null,
            registration_status: "open",
          }))
        )
      );
    }

    const { data: inserted, error } = await supabase.from("swim_sessions").insert(rows).select("id");
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

    // Auto-generate class dates
    if (inserted && period) {
      // Format Date as YYYY-MM-DD using local components — toISOString() converts
      // to UTC and can shift dates by one day depending on the runtime timezone.
      const fmtLocalYMD = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      for (const [idx, insertedRow] of inserted.entries()) {
        const rowDow = rows[idx].day_of_week as string;
        // Parse day nums from the day_of_week string (works for both "Monday" and "monday_wednesday")
        const dayNums = rowDow.split("_").map(d => dayMap[d.charAt(0).toUpperCase() + d.slice(1)] ?? -1).filter(n => n >= 0);
        const classDates: string[] = [];
        const cur = new Date(period.start_date + "T00:00:00");
        const endD = new Date(period.end_date + "T00:00:00");
        while (cur <= endD) {
          if (dayNums.includes(cur.getDay())) classDates.push(fmtLocalYMD(cur));
          cur.setDate(cur.getDate() + 1);
        }
        if (classDates.length > 0) {
          const dateRows = classDates.map(d => ({ session_id: insertedRow.id, lesson_date: d }));
          await supabase.from("session_lesson_dates").upsert(dateRows, { onConflict: "session_id,lesson_date" });
        }
      }
    }

    toast({ title: `${rows.length} class(es) created` });
    setCreateDialogOpen(false);
    resetCreateForm();
    fetchData();
  };

  // --- Edit single class ---
  const openEditClass = (s: Session) => {
    setEditingClassId(s.id);
    setEditForm({
      session_period_id: s.session_period_id || "",
      day_of_week: s.day_of_week,
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      swim_level: s.swim_level,
      age_group: s.age_group || "preschool-3-5",
      max_students: String(s.max_students),
      instructor_id: s.instructor_id || "",
      registration_status: s.registration_status || "open",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingClassId) return;
    const period = periods.find(p => p.id === editForm.session_period_id);
    const { error } = await supabase.from("swim_sessions").update({
      session_name: LEVEL_TO_GROUP[editForm.swim_level] || editForm.swim_level,
      session_period_id: editForm.session_period_id || null,
      session_start_date: period?.start_date || null,
      session_end_date: period?.end_date || null,
      start_time: editForm.start_time,
      end_time: editForm.end_time,
      day_of_week: editForm.day_of_week,
      swim_level: editForm.swim_level,
      age_group: editForm.age_group,
      max_students: parseInt(editForm.max_students) || 3,
      instructor_id: editForm.instructor_id || null,
      registration_status: editForm.registration_status,
    }).eq("id", editingClassId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Class updated" });
    setEditDialogOpen(false);
    setEditingClassId(null);
    fetchData();
  };

  // --- Inline actions ---
  const toggleStatus = async (slotSessions: Session[]) => {
    const next = slotSessions[0].registration_status === "open" ? "closed" : "open";
    const { error } = await supabase.from("swim_sessions")
      .update({ registration_status: next })
      .in("id", slotSessions.map(s => s.id));
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Class ${next}` });
    fetchData();
  };

  const assignInstructor = async (slotSessions: Session[], instructorId: string) => {
    const { error } = await supabase.from("swim_sessions")
      .update({ instructor_id: instructorId || null })
      .in("id", slotSessions.map(s => s.id));
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Instructor updated" });
    fetchData();
  };

  const duplicateToCreate = (s: Session, slotSessions: Session[]) => {
    const levels = [...new Set(slotSessions.map(ss => ss.swim_level))];
    setCreateForm({
      session_period_id: s.session_period_id || "",
      timeSlots: [{ start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) }],
      swim_levels: levels,
      age_group: s.age_group || "preschool-3-5",
      max_students: String(s.max_students),
      days: [s.day_of_week],
      instructor_id: s.instructor_id || "",
      frequency: "weekly",
    });
    setCreateDialogOpen(true);
  };

  // --- Grouping ---
  const activeSessions = sessions.filter(s => s.is_active);
  const filtered = filterAgeGroup === "all" ? activeSessions : activeSessions.filter(s => s.age_group === filterAgeGroup);

  interface PeriodGroup {
    period: SessionPeriod | null;
    subgroups: Record<string, { ageGroup: string; slots: SlotGroup[] }>;
  }

  const periodGroupMap: Record<string, PeriodGroup> = {};

  for (const s of filtered) {
    const pId = s.session_period_id || "unlinked";
    if (!periodGroupMap[pId]) {
      periodGroupMap[pId] = { period: periods.find(p => p.id === pId) || null, subgroups: {} };
    }
    const displayName = s.session_name || "Unnamed";
    if (!periodGroupMap[pId].subgroups[displayName]) {
      periodGroupMap[pId].subgroups[displayName] = { ageGroup: s.age_group || "unknown", slots: [] };
    }
    const sub = periodGroupMap[pId].subgroups[displayName];
    const slotKey = `${s.start_time}|${s.day_of_week}`;
    let slot = sub.slots.find(sg => sg.key === slotKey);
    if (!slot) {
      slot = { key: slotKey, sessions: [], levels: [], first: s };
      sub.slots.push(slot);
    }
    slot.sessions.push(s);
    if (!slot.levels.includes(s.swim_level)) {
      slot.levels.push(s.swim_level);
      const ORDER: string[] = ["white", "red", "yellow", "blue", "green"];
      slot.levels.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    }
  }

  const sortedPeriods = Object.entries(periodGroupMap).sort(([, a], [, b]) => {
    const aDate = a.period?.start_date || "9999";
    const bDate = b.period?.start_date || "9999";
    return aDate.localeCompare(bDate);
  });

  const getInstructorName = (id: string | null) => {
    if (!id) return null;
    return instructors.find(i => i.id === id)?.name || null;
  };

  const computeClassCount = () => {
    const validSlots = createForm.timeSlots.filter(ts => ts.start && ts.end).length;
    const levels = createForm.swim_levels.length;
    const dayCount = createForm.days.length;
    if (createForm.frequency === "twice_weekly") return validSlots * levels; // days combined into one class
    return validSlots * levels * dayCount;
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-display font-bold text-foreground">Sessions & Classes</h2>
        <div className="flex items-center gap-3">
          <Select value={filterAgeGroup} onValueChange={setFilterAgeGroup}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ages</SelectItem>
              <SelectItem value="preschool-3-5">Preschool</SelectItem>
              <SelectItem value="school-age-6-12">School-Age</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) resetCreateForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Create Classes</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Classes</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {/* Step 1: Select Session */}
                <div>
                  <Label className="text-sm font-semibold">Session *</Label>
                  <Select value={createForm.session_period_id || "none"} onValueChange={v => setCreateForm(f => ({ ...f, session_period_id: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select a session..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select a session...</SelectItem>
                      {periods.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({formatDateRange(p.start_date, p.end_date)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Step 2: Time Slots */}
                <div>
                  <Label className="text-sm font-semibold">Class Times *</Label>
                  <div className="space-y-2 mt-1">
                    {createForm.timeSlots.map((ts, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input type="time" className="flex-1" value={ts.start} onChange={e => updateTimeSlot(idx, "start", e.target.value)} />
                        <span className="text-muted-foreground text-sm">–</span>
                        <Input type="time" className="flex-1" value={ts.end} onChange={e => updateTimeSlot(idx, "end", e.target.value)} />
                        {createForm.timeSlots.length > 1 && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => removeTimeSlot(idx)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" className="mt-2 w-full" onClick={addTimeSlot}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Time Slot
                  </Button>
                </div>

                {/* Step 3: Levels */}
                <div>
                  <Label className="text-sm font-semibold">Levels * <span className="font-normal text-muted-foreground">(each level = separate class)</span></Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {ALL_LEVELS.map(lvl => {
                      const lc = LEVEL_BADGE_COLORS[lvl];
                      const isChecked = createForm.swim_levels.includes(lvl);
                      return (
                        <label key={lvl} className={`flex items-center gap-1.5 text-sm cursor-pointer px-2.5 py-1 rounded-full ring-1 transition-all ${
                          isChecked ? `${lc.bg} ${lc.text} ${lc.ring} font-medium` : "bg-muted text-muted-foreground ring-border"
                        }`}>
                          <Checkbox checked={isChecked} onCheckedChange={() => toggleCreateLevel(lvl)} className="h-3.5 w-3.5" />
                          {LEVEL_DISPLAY[lvl].name}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Age Group + Capacity */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-semibold">Age Group *</Label>
                    <Select value={createForm.age_group} onValueChange={v => setCreateForm(f => ({ ...f, age_group: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="preschool-3-5">Preschool</SelectItem>
                        <SelectItem value="school-age-6-12">School-Age</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Max Students (per class)</Label>
                    <Input type="number" value={createForm.max_students} onChange={e => setCreateForm(f => ({ ...f, max_students: e.target.value }))} />
                  </div>
                </div>

                {/* Days */}
                <div>
                  <Label className="text-sm font-semibold">Days *</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {DAYS.map(day => (
                      <label key={day} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <Checkbox checked={createForm.days.includes(day)} onCheckedChange={() => toggleCreateDay(day)} />
                        {day.slice(0, 3)}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Frequency */}
                {createForm.days.length >= 2 && (
                  <div>
                    <Label className="text-sm font-semibold">Frequency</Label>
                    <RadioGroup
                      value={createForm.frequency}
                      onValueChange={(v: "weekly" | "twice_weekly") => setCreateForm(f => ({ ...f, frequency: v }))}
                      className="flex gap-4 mt-1"
                    >
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <RadioGroupItem value="weekly" />
                        Weekly <span className="text-muted-foreground">(separate class per day)</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <RadioGroupItem value="twice_weekly" />
                        {createForm.days.length}x/week <span className="text-muted-foreground">(combined)</span>
                      </label>
                    </RadioGroup>
                  </div>
                )}

                {/* Instructor */}
                <div>
                  <Label className="text-sm font-semibold">Instructor</Label>
                  <Select value={createForm.instructor_id || "none"} onValueChange={v => setCreateForm(f => ({ ...f, instructor_id: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {instructors.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Summary + Submit */}
                {computeClassCount() > 0 && (
                  <div className="rounded-md bg-muted/50 border p-3 text-sm text-muted-foreground">
                    Will create <span className="font-semibold text-foreground">{computeClassCount()}</span> class(es)
                    {createForm.frequency === "twice_weekly" && createForm.days.length >= 2
                      ? `: ${createForm.timeSlots.filter(ts => ts.start && ts.end).length} time slot(s) × ${createForm.swim_levels.length} level(s), meeting ${createForm.days.map(d => d.slice(0, 3)).join(" & ")}`
                      : `: ${createForm.timeSlots.filter(ts => ts.start && ts.end).length} time slot(s) × ${createForm.swim_levels.length} level(s) × ${createForm.days.length} day(s)`
                    }
                  </div>
                )}

                <Button onClick={handleCreateClasses} className="w-full">Create Classes</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Sessions Management (formerly "Session Periods") */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Sessions</CardTitle>
            <Dialog open={sessionDialogOpen} onOpenChange={(open) => { setSessionDialogOpen(open); if (!open) resetSessionForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline"><Plus className="w-3.5 h-3.5 mr-1" /> Add Session</Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>{editingSessionId ? "Edit Session" : "New Session"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Name *</Label><Input value={sessionForm.name} onChange={e => setSessionForm(f => ({ ...f, name: e.target.value }))} placeholder="Session 3" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Start Date *</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !sessionForm.start_date && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {sessionForm.start_date ? format(sessionForm.start_date, "MMM d, yyyy") : "Pick"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={sessionForm.start_date} onSelect={d => setSessionForm(f => ({ ...f, start_date: d }))} className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <Label>End Date *</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !sessionForm.end_date && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {sessionForm.end_date ? format(sessionForm.end_date, "MMM d, yyyy") : "Pick"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={sessionForm.end_date} onSelect={d => setSessionForm(f => ({ ...f, end_date: d }))} className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <Button onClick={handleSaveSession} className="w-full">{editingSessionId ? "Update" : "Create"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {periods.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">No sessions yet. Create one to get started.</p>
          ) : (
            <div className="divide-y divide-border">
              {periods.map(p => {
                const linkedCount = sessions.filter(s => s.session_period_id === p.id).length;
                return (
                  <div key={p.id} className="flex items-center justify-between py-2">
                    <div>
                      <span className="font-medium text-sm">{p.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{formatDateRange(p.start_date, p.end_date)}</span>
                      <span className="text-xs text-muted-foreground ml-2">({linkedCount} classes)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {
                        setCreateForm(f => ({ ...f, session_period_id: p.id }));
                        setCreateDialogOpen(true);
                      }}>
                        <Plus className="w-3 h-3 mr-1" /> Add Classes
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                        setEditingSessionId(p.id);
                        setSessionForm({ name: p.name, start_date: new Date(p.start_date + "T00:00:00"), end_date: new Date(p.end_date + "T00:00:00") });
                        setSessionDialogOpen(true);
                      }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteSession(p.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Class Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditingClassId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Class</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Session</Label>
              <Select value={editForm.session_period_id || "none"} onValueChange={v => setEditForm(f => ({ ...f, session_period_id: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Time</Label><Input type="time" value={editForm.start_time} onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))} /></div>
              <div><Label>End Time</Label><Input type="time" value={editForm.end_time} onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Level</Label>
              <Select value={editForm.swim_level} onValueChange={v => setEditForm(f => ({ ...f, swim_level: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_LEVELS.map(lvl => <SelectItem key={lvl} value={lvl}>{LEVEL_DISPLAY[lvl].name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Age Group</Label>
                <Select value={editForm.age_group} onValueChange={v => setEditForm(f => ({ ...f, age_group: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preschool-3-5">Preschool</SelectItem>
                    <SelectItem value="school-age-6-12">School-Age</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Max Students</Label><Input type="number" value={editForm.max_students} onChange={e => setEditForm(f => ({ ...f, max_students: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Day</Label>
                <Select value={editForm.day_of_week} onValueChange={v => setEditForm(f => ({ ...f, day_of_week: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editForm.registration_status} onValueChange={v => setEditForm(f => ({ ...f, registration_status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleSaveEdit} className="w-full">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Classes grouped by session */}
      {sortedPeriods.map(([pId, group]) => (
        <div key={pId} className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-display font-bold text-foreground">
              {group.period?.name || "Unlinked Classes"}
            </h3>
            {group.period && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <CalendarIcon className="w-3.5 h-3.5" />
                {formatDateRange(group.period.start_date, group.period.end_date)}
              </span>
            )}
          </div>

          {Object.entries(group.subgroups).map(([groupName, sub]) => {
            const ag = sub.ageGroup;
            return (
              <Card key={groupName} className="overflow-hidden">
                <CardHeader className="py-3 px-4 bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{groupName}</CardTitle>
                      <Badge variant="outline" className={`text-[10px] ${
                        ag === "preschool-3-5" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-teal-50 text-teal-700 border-teal-200"
                      }`}>
                        {ag === "preschool-3-5" ? "Preschool 3–5" : "School-Age 6–12"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{sub.slots.length} time slots</span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {sub.slots.map(slot => {
                      const s = slot.first;
                      const isOpen = s.registration_status === "open";
                      const primaryLevel = slot.levels[0] || "white";
                      const borderColor = LEVEL_BORDER[primaryLevel] || "border-l-gray-300";

                      return (
                        <div key={slot.key} className={`flex items-center gap-3 px-4 py-3 border-l-4 ${borderColor} hover:bg-muted/30 transition-colors`}>
                          <div className="w-[140px] shrink-0">
                            <span className="text-sm font-medium text-foreground">
                              {formatTime(s.start_time)} – {formatTime(s.end_time)}
                            </span>
                          </div>
                          <div className="flex gap-1 w-[160px] shrink-0 flex-wrap">
                            {slot.levels.map(l => {
                              const lc = LEVEL_BADGE_COLORS[l as SwimLevel];
                              return lc ? (
                                <span key={l} className={`px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${lc.bg} ${lc.text} ${lc.ring}`}>
                                  {LEVEL_DISPLAY[l as SwimLevel]?.name}
                                </span>
                              ) : null;
                            })}
                          </div>
                          <div className="flex items-center gap-1 w-[50px] shrink-0 text-sm text-muted-foreground">
                            <Users className="w-3.5 h-3.5" />
                            {s.max_students}
                          </div>
                          <div className="w-[140px] shrink-0">
                            <Select
                              value={s.instructor_id || "unassigned"}
                              onValueChange={v => assignInstructor(slot.sessions, v === "unassigned" ? "" : v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Assign" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {instructors.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <Badge
                            variant={isOpen ? "default" : "secondary"}
                            className="text-xs capitalize cursor-pointer shrink-0"
                            onClick={() => toggleStatus(slot.sessions)}
                          >
                            {isOpen ? <ToggleRight className="w-3 h-3 mr-1" /> : <ToggleLeft className="w-3 h-3 mr-1" />}
                            {s.registration_status}
                          </Badge>
                          <div className="flex items-center gap-1 ml-auto shrink-0">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                              setManageDatesSlot({
                                sessionIds: slot.sessions.map(ss => ss.id),
                                startDate: s.session_start_date || "",
                                endDate: s.session_end_date || "",
                                label: `${formatTime(s.start_time)} – ${formatTime(s.end_time)} · ${slot.levels.map(l => LEVEL_DISPLAY[l as SwimLevel]?.name).join("/")}`,
                                daysOfWeek: s.day_of_week,
                              });
                              setManageDatesOpen(true);
                            }} title="Manage Dates">
                              <CalendarDays className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditClass(s)} title="Edit">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicateToCreate(s, slot.sessions)} title="Duplicate">
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}

      {manageDatesSlot && (
        <ManageDatesModal
          open={manageDatesOpen}
          onOpenChange={setManageDatesOpen}
          sessionIds={manageDatesSlot.sessionIds}
          sessionStartDate={manageDatesSlot.startDate}
          sessionEndDate={manageDatesSlot.endDate}
          sessionLabel={manageDatesSlot.label}
          daysOfWeek={manageDatesSlot.daysOfWeek}
        />
      )}

      {sortedPeriods.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No classes match your filter.</p>
        </Card>
      )}
    </div>
  );
};

export default SessionsAdmin;
