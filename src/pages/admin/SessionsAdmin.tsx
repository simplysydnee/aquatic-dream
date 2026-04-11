import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { LEVEL_DISPLAY, LEVEL_BADGE_COLORS, type SwimLevel } from "@/components/swim-enrollment/types";
import { Plus, Pencil, Copy, Loader2, CalendarIcon, ToggleLeft, ToggleRight, Clock, Users, CalendarDays } from "lucide-react";
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

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ALL_LEVELS: SwimLevel[] = ["white", "red", "yellow", "blue", "green"];

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
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterAgeGroup, setFilterAgeGroup] = useState<string>("all");
  const [manageDatesOpen, setManageDatesOpen] = useState(false);
  const [manageDatesSlot, setManageDatesSlot] = useState<{ sessionIds: string[]; startDate: string; endDate: string; label: string } | null>(null);
  const [form, setForm] = useState({
    session_name: "",
    session_start_date: undefined as Date | undefined,
    session_end_date: undefined as Date | undefined,
    days: [] as string[],
    start_time: "",
    end_time: "",
    swim_levels: ["white"] as string[],
    age_group: "preschool-3-5" as string,
    max_students: "3",
    instructor_id: "",
    registration_status: "open",
  });

  const fetchData = async () => {
    const [sessRes, instrRes] = await Promise.all([
      supabase.from("swim_sessions").select("*").order("session_name").order("start_time"),
      supabase.from("instructors").select("id, name").eq("is_active", true).order("name"),
    ]);
    if (sessRes.data) setSessions(sessRes.data);
    if (instrRes.data) setInstructors(instrRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setForm({
      session_name: "", session_start_date: undefined, session_end_date: undefined,
      days: [], start_time: "", end_time: "", swim_levels: ["white"],
      age_group: "preschool-3-5", max_students: "3", instructor_id: "", registration_status: "open",
    });
    setEditingId(null);
  };

  const openEdit = (s: Session, slotSessions: Session[]) => {
    const levels = [...new Set(slotSessions.map(ss => ss.swim_level))];
    setEditingId(s.id);
    setForm({
      session_name: s.session_name || "",
      session_start_date: s.session_start_date ? new Date(s.session_start_date + "T00:00:00") : undefined,
      session_end_date: s.session_end_date ? new Date(s.session_end_date + "T00:00:00") : undefined,
      days: [s.day_of_week],
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      swim_levels: levels,
      age_group: s.age_group || "preschool-3-5",
      max_students: String(s.max_students),
      instructor_id: s.instructor_id || "",
      registration_status: s.registration_status || "open",
    });
    setDialogOpen(true);
  };

  const duplicateSession = (s: Session, slotSessions: Session[]) => {
    const levels = [...new Set(slotSessions.map(ss => ss.swim_level))];
    setEditingId(null);
    setForm({
      session_name: s.session_name || "",
      session_start_date: s.session_start_date ? new Date(s.session_start_date + "T00:00:00") : undefined,
      session_end_date: s.session_end_date ? new Date(s.session_end_date + "T00:00:00") : undefined,
      days: [s.day_of_week],
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      swim_levels: levels,
      age_group: s.age_group || "preschool-3-5",
      max_students: String(s.max_students),
      instructor_id: s.instructor_id || "",
      registration_status: "open",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.session_name || !form.start_time || !form.end_time || form.days.length === 0 || form.swim_levels.length === 0) {
      toast({ title: "Missing required fields", description: "Name, days, times, and at least one level are required", variant: "destructive" });
      return;
    }
    const basePayload = {
      session_name: form.session_name,
      session_start_date: form.session_start_date ? format(form.session_start_date, "yyyy-MM-dd") : null,
      session_end_date: form.session_end_date ? format(form.session_end_date, "yyyy-MM-dd") : null,
      start_time: form.start_time,
      end_time: form.end_time,
      age_group: form.age_group,
      max_students: parseInt(form.max_students) || 3,
      instructor_id: form.instructor_id || null,
      registration_status: form.registration_status,
    };
    if (editingId) {
      const { error } = await supabase.from("swim_sessions")
        .update({ ...basePayload, day_of_week: form.days[0], swim_level: form.swim_levels[0] })
        .eq("id", editingId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Session updated" });
    } else {
      const rows = form.days.flatMap(day =>
        form.swim_levels.map(lvl => ({ ...basePayload, day_of_week: day, swim_level: lvl }))
      );
      const { error } = await supabase.from("swim_sessions").insert(rows);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: `${rows.length} session row(s) created` });
    }
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const toggleStatus = async (slotSessions: Session[]) => {
    const next = slotSessions[0].registration_status === "open" ? "closed" : "open";
    const { error } = await supabase.from("swim_sessions")
      .update({ registration_status: next })
      .in("id", slotSessions.map(s => s.id));
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Slot ${next}` });
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

  const toggleDay = (day: string) => {
    setForm(f => ({ ...f, days: f.days.includes(day) ? f.days.filter(d => d !== day) : [...f.days, day] }));
  };
  const toggleLevel = (lvl: string) => {
    setForm(f => ({ ...f, swim_levels: f.swim_levels.includes(lvl) ? f.swim_levels.filter(l => l !== lvl) : [...f.swim_levels, lvl] }));
  };

  // Combine related session names for display
  const COMBINED_GROUPS: Record<string, string> = {
    "Bubble Makers": "Bubble Makers / Reef Explorers",
    "Reef Explorers": "Bubble Makers / Reef Explorers",
    "Deep Sea Divers": "Deep Sea Divers / Ocean Masters",
    "Ocean Masters": "Deep Sea Divers / Ocean Masters",
  };
  const getDisplayGroup = (name: string) => COMBINED_GROUPS[name] || name;

  const activeSessions = sessions.filter(s => s.is_active);
  const filtered = filterAgeGroup === "all" ? activeSessions : activeSessions.filter(s => s.age_group === filterAgeGroup);

  // Group by session period (date range) → display group → slots
  interface SessionPeriod {
    label: string;
    startDate: string;
    subgroups: Record<string, { ageGroup: string; slots: SlotGroup[] }>;
  }

  const periodMap: Record<string, SessionPeriod> = {};

  // Determine session period key from dates — sessions with close start dates belong together
  const getSessionPeriodKey = (s: Session) => `${s.session_start_date || "none"}`;

  for (const s of filtered) {
    const periodKey = getSessionPeriodKey(s);
    if (!periodMap[periodKey]) {
      periodMap[periodKey] = {
        label: formatDateRange(s.session_start_date, s.session_end_date),
        startDate: s.session_start_date || "",
        subgroups: {},
      };
    }
    const displayName = getDisplayGroup(s.session_name || "Unnamed");
    if (!periodMap[periodKey].subgroups[displayName]) {
      periodMap[periodKey].subgroups[displayName] = { ageGroup: s.age_group || "unknown", slots: [] };
    }
    const sub = periodMap[periodKey].subgroups[displayName];

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

  // Sort periods by start date
  const sortedPeriods = Object.entries(periodMap).sort(([, a], [, b]) => a.startDate.localeCompare(b.startDate));

  // Calculate total classes from date range
  const getClassCount = (startDate: string | null, endDate: string | null) => {
    if (!startDate || !endDate) return null;
    const s = new Date(startDate + "T00:00:00");
    const e = new Date(endDate + "T00:00:00");
    const weeks = Math.round((e.getTime() - s.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return weeks * 2; // Mon & Wed = 2 per week
  };

  const getInstructorName = (id: string | null) => {
    if (!id) return null;
    return instructors.find(i => i.id === id)?.name || null;
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-display font-bold text-foreground">Swim Sessions</h2>
        <div className="flex items-center gap-3">
          <Select value={filterAgeGroup} onValueChange={setFilterAgeGroup}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ages</SelectItem>
              <SelectItem value="preschool-3-5">Preschool</SelectItem>
              <SelectItem value="school-age-6-12">School-Age</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Create Session</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingId ? "Edit Session" : "Create Session"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Session Name *</Label>
                  <Select value={form.session_name || "custom"} onValueChange={v => setForm(f => ({ ...f, session_name: v === "custom" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select group name" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bubble Makers">Bubble Makers</SelectItem>
                      <SelectItem value="Reef Explorers">Reef Explorers</SelectItem>
                      <SelectItem value="Sea Scouts">Sea Scouts</SelectItem>
                      <SelectItem value="Deep Sea Divers">Deep Sea Divers</SelectItem>
                      <SelectItem value="Ocean Masters">Ocean Masters</SelectItem>
                      <SelectItem value="custom">Custom...</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.session_name === "" && (
                    <Input className="mt-1" placeholder="Custom session name" value="" onChange={e => setForm(f => ({ ...f, session_name: e.target.value }))} />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.session_start_date && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.session_start_date ? format(form.session_start_date, "MMM d, yyyy") : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={form.session_start_date} onSelect={d => setForm(f => ({ ...f, session_start_date: d }))} className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.session_end_date && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.session_end_date ? format(form.session_end_date, "MMM d, yyyy") : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={form.session_end_date} onSelect={d => setForm(f => ({ ...f, session_end_date: d }))} className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div>
                  <Label>Days of Week *</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {DAYS.map(day => (
                      <label key={day} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <Checkbox checked={form.days.includes(day)} onCheckedChange={() => toggleDay(day)} />
                        {day.slice(0, 3)}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Start Time *</Label><Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} /></div>
                  <div><Label>End Time *</Label><Input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} /></div>
                </div>
                <div>
                  <Label>Swim Levels * (select all that apply)</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {ALL_LEVELS.map(lvl => {
                      const lc = LEVEL_BADGE_COLORS[lvl];
                      const isChecked = form.swim_levels.includes(lvl);
                      return (
                        <label key={lvl} className={`flex items-center gap-1.5 text-sm cursor-pointer px-2.5 py-1 rounded-full ring-1 transition-all ${
                          isChecked ? `${lc.bg} ${lc.text} ${lc.ring} font-medium` : "bg-muted text-muted-foreground ring-border"
                        }`}>
                          <Checkbox checked={isChecked} onCheckedChange={() => toggleLevel(lvl)} className="h-3.5 w-3.5" />
                          {LEVEL_DISPLAY[lvl].name}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Age Group *</Label>
                    <Select value={form.age_group} onValueChange={v => setForm(f => ({ ...f, age_group: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="preschool-3-5">Preschool</SelectItem>
                        <SelectItem value="school-age-6-12">School-Age</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Max Students (per slot)</Label><Input type="number" value={form.max_students} onChange={e => setForm(f => ({ ...f, max_students: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Status</Label>
                    <Select value={form.registration_status} onValueChange={v => setForm(f => ({ ...f, registration_status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Instructor</Label>
                    <Select value={form.instructor_id || "none"} onValueChange={v => setForm(f => ({ ...f, instructor_id: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {instructors.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleSave} className="w-full">{editingId ? "Save Changes" : "Create Session"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Session periods */}
      {sortedPeriods.map(([periodKey, period], idx) => {
        const firstSubSlot = Object.values(period.subgroups)[0]?.slots[0]?.first;
        

        return (
          <div key={periodKey} className="space-y-4">
            {/* Period header */}
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-display font-bold text-foreground">Session {idx + 1}</h3>
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <CalendarIcon className="w-3.5 h-3.5" />
                {period.label}
              </span>


            </div>

            {/* Subgroups within this period */}
            {Object.entries(period.subgroups).map(([groupName, sub]) => {
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
                                });
                                setManageDatesOpen(true);
                              }} title="Manage Dates">
                                <CalendarDays className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s, slot.sessions)} title="Edit">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicateSession(s, slot.sessions)} title="Duplicate">
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
        );
      })}

      {manageDatesSlot && (
        <ManageDatesModal
          open={manageDatesOpen}
          onOpenChange={setManageDatesOpen}
          sessionIds={manageDatesSlot.sessionIds}
          sessionStartDate={manageDatesSlot.startDate}
          sessionEndDate={manageDatesSlot.endDate}
          sessionLabel={manageDatesSlot.label}
        />
      )}

      {sortedPeriods.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No sessions match your filter.</p>
        </Card>
      )}
    </div>
  );
};

export default SessionsAdmin;

