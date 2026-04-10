import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { LEVEL_DISPLAY, LEVEL_BADGE_COLORS, type SwimLevel, AGE_GROUP_LABELS, type AgeGroup } from "@/components/swim-enrollment/types";
import { Plus, Pencil, Copy, Loader2, CalendarIcon, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

const SessionsAdmin = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    session_name: "",
    session_start_date: undefined as Date | undefined,
    session_end_date: undefined as Date | undefined,
    days: [] as string[],
    start_time: "",
    end_time: "",
    swim_level: "white" as string,
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
      days: [], start_time: "", end_time: "", swim_level: "white",
      age_group: "preschool-3-5", max_students: "3", instructor_id: "", registration_status: "open",
    });
    setEditingId(null);
  };

  const openEdit = (s: Session) => {
    setEditingId(s.id);
    setForm({
      session_name: s.session_name || "",
      session_start_date: s.session_start_date ? new Date(s.session_start_date + "T00:00:00") : undefined,
      session_end_date: s.session_end_date ? new Date(s.session_end_date + "T00:00:00") : undefined,
      days: [s.day_of_week],
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      swim_level: s.swim_level,
      age_group: s.age_group || "preschool-3-5",
      max_students: String(s.max_students),
      instructor_id: s.instructor_id || "",
      registration_status: s.registration_status || "open",
    });
    setDialogOpen(true);
  };

  const duplicateSession = (s: Session) => {
    setEditingId(null);
    setForm({
      session_name: s.session_name || "",
      session_start_date: s.session_start_date ? new Date(s.session_start_date + "T00:00:00") : undefined,
      session_end_date: s.session_end_date ? new Date(s.session_end_date + "T00:00:00") : undefined,
      days: [s.day_of_week],
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      swim_level: s.swim_level,
      age_group: s.age_group || "preschool-3-5",
      max_students: String(s.max_students),
      instructor_id: s.instructor_id || "",
      registration_status: "open",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.session_name || !form.start_time || !form.end_time || form.days.length === 0) {
      toast({ title: "Missing required fields", description: "Name, days, start & end times are required", variant: "destructive" });
      return;
    }

    const basePayload = {
      session_name: form.session_name,
      session_start_date: form.session_start_date ? format(form.session_start_date, "yyyy-MM-dd") : null,
      session_end_date: form.session_end_date ? format(form.session_end_date, "yyyy-MM-dd") : null,
      start_time: form.start_time,
      end_time: form.end_time,
      swim_level: form.swim_level,
      age_group: form.age_group,
      max_students: parseInt(form.max_students) || 3,
      instructor_id: form.instructor_id || null,
      registration_status: form.registration_status,
    };

    if (editingId) {
      const { error } = await supabase.from("swim_sessions")
        .update({ ...basePayload, day_of_week: form.days[0] })
        .eq("id", editingId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Session updated" });
    } else {
      // Create one row per day selected
      const rows = form.days.map(day => ({ ...basePayload, day_of_week: day }));
      const { error } = await supabase.from("swim_sessions").insert(rows);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: `${rows.length} session(s) created` });
    }
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const toggleStatus = async (s: Session) => {
    const next = s.registration_status === "open" ? "closed" : "open";
    const { error } = await supabase.from("swim_sessions").update({ registration_status: next }).eq("id", s.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Session ${next}` });
    fetchData();
  };

  const toggleDay = (day: string) => {
    setForm(f => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter(d => d !== day) : [...f.days, day],
    }));
  };

  // Group sessions by session_name
  const grouped = sessions.reduce<Record<string, Session[]>>((acc, s) => {
    const key = s.session_name || "Unnamed";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const getInstructorName = (id: string | null) => {
    if (!id) return null;
    return instructors.find(i => i.id === id)?.name || null;
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold text-foreground">Swim Sessions</h2>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Create Session</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Edit Session" : "Create Session"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Session Name *</Label><Input placeholder="e.g. Session 3" value={form.session_name} onChange={e => setForm(f => ({ ...f, session_name: e.target.value }))} /></div>

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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Swim Level *</Label>
                  <Select value={form.swim_level} onValueChange={v => setForm(f => ({ ...f, swim_level: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["white", "red", "yellow", "blue", "green"] as SwimLevel[]).map(l => (
                        <SelectItem key={l} value={l}>{LEVEL_DISPLAY[l].name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>Max Students</Label><Input type="number" value={form.max_students} onChange={e => setForm(f => ({ ...f, max_students: e.target.value }))} /></div>
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
              </div>

              <div>
                <Label>Instructor</Label>
                <Select value={form.instructor_id} onValueChange={v => setForm(f => ({ ...f, instructor_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="None (assign later)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {instructors.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleSave} className="w-full">{editingId ? "Save Changes" : "Create Session"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {Object.entries(grouped).map(([name, groupSessions]) => (
        <Card key={name}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{name}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Day</TableHead>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">Level</TableHead>
                  <TableHead className="text-xs">Age Group</TableHead>
                  <TableHead className="text-xs">Cap</TableHead>
                  <TableHead className="text-xs">Instructor</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupSessions.map(s => {
                  const levelColors = LEVEL_BADGE_COLORS[s.swim_level as SwimLevel];
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm">{s.day_of_week}</TableCell>
                      <TableCell className="text-sm">{formatTime(s.start_time)} – {formatTime(s.end_time)}</TableCell>
                      <TableCell>
                        {levelColors ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${levelColors.bg} ${levelColors.text} ${levelColors.ring}`}>
                            {LEVEL_DISPLAY[s.swim_level as SwimLevel]?.name || s.swim_level}
                          </span>
                        ) : (
                          <span className="text-sm">{s.swim_level}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${s.age_group === "preschool-3-5" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-teal-50 text-teal-700 border-teal-200"}`}>
                          {s.age_group === "preschool-3-5" ? "Preschool" : "School-Age"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{s.max_students}</TableCell>
                      <TableCell className="text-sm">{getInstructorName(s.instructor_id) || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={s.registration_status === "open" ? "default" : "secondary"} className="text-xs capitalize">
                          {s.registration_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)} title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicateSession(s)} title="Duplicate">
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleStatus(s)} title="Toggle open/closed">
                            {s.registration_status === "open" ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {sessions.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No sessions yet. Create your first session above.</p>
        </Card>
      )}
    </div>
  );
};

export default SessionsAdmin;
