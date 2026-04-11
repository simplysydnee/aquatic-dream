import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LEVEL_DISPLAY, LEVEL_BADGE_COLORS, type SwimLevel, getGroupName, getAgeGroup, AGE_GROUP_LABELS } from "@/components/swim-enrollment/types";
import { Users, Plus, ArrowRightLeft, Loader2, Calendar, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Session {
  id: string;
  session_name: string | null;
  session_start_date: string | null;
  session_end_date: string | null;
  start_time: string;
  end_time: string;
  swim_level: string;
  age_group: string | null;
  max_students: number;
  day_of_week: string;
  is_active: boolean;
  instructor_id: string | null;
  registration_status: string;
}

interface Enrollment {
  id: string;
  child_name: string;
  child_age: number;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  swim_level: string;
  status: string;
  session_id: string | null;
  notes: string | null;
  created_at: string;
}

interface Instructor {
  id: string;
  name: string;
}

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start || !end) return "";
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
}

function formatDayOfWeek(dow: string) {
  const map: Record<string, string> = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
    monday_wednesday: "Mon & Wed",
    tuesday_thursday: "Tue & Thu",
  };
  return map[dow] || dow;
}

const LEVEL_BORDER_COLORS: Record<string, string> = {
  white: "border-l-gray-400",
  red: "border-l-red-400",
  yellow: "border-l-yellow-400",
  blue: "border-l-blue-400",
  green: "border-l-green-400",
};

const ClassRosterAdmin = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSession, setFilterSession] = useState<string>("all");
  const [filterAgeGroup, setFilterAgeGroup] = useState<string>("all");
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [filterInstructor, setFilterInstructor] = useState<string>("all");
  const [filterTime, setFilterTime] = useState<string>("all");
  const [manualOpen, setManualOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [movingEnrollment, setMovingEnrollment] = useState<Enrollment | null>(null);
  const [newSessionId, setNewSessionId] = useState("");
  const [manualForm, setManualForm] = useState({
    child_name: "", child_age: "", parent_name: "", parent_email: "",
    parent_phone: "", swim_level: "white", session_id: "", notes: "",
  });

  const fetchData = async () => {
    const [sessRes, enrRes, instrRes] = await Promise.all([
      supabase.from("swim_sessions").select("*").eq("is_active", true).order("start_time"),
      supabase.from("swim_enrollments").select("*").in("status", ["pending", "confirmed"]),
      supabase.from("instructors").select("id, name").eq("is_active", true).order("name"),
    ]);
    if (sessRes.data) setSessions(sessRes.data);
    if (enrRes.data) setEnrollments(enrRes.data);
    if (instrRes.data) setInstructors(instrRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const sessionNames = [...new Set(sessions.map(s => s.session_name).filter(Boolean))];
  const uniqueTimes = [...new Set(sessions.map(s => s.start_time))].sort();

  // Apply filters
  const filteredSessions = sessions.filter(s => {
    if (filterSession !== "all" && s.session_name !== filterSession) return false;
    if (filterAgeGroup !== "all" && s.age_group !== filterAgeGroup) return false;
    if (filterLevel !== "all" && s.swim_level !== filterLevel) return false;
    if (filterInstructor !== "all") {
      if (filterInstructor === "unassigned" && s.instructor_id) return false;
      if (filterInstructor !== "unassigned" && s.instructor_id !== filterInstructor) return false;
    }
    if (filterTime !== "all" && s.start_time !== filterTime) return false;
    return true;
  });

  // Group by session_name + start_time + age_group (same time slot)
  const grouped = filteredSessions.reduce<Record<string, Session[]>>((acc, s) => {
    const key = `${s.session_name}|${s.start_time}|${s.age_group}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const getEnrolledForSlot = (slotSessions: Session[]) => {
    const ids = new Set(slotSessions.map(s => s.id));
    return enrollments.filter(e => e.session_id && ids.has(e.session_id));
  };

  const getSessionEnrollments = (sessionId: string) =>
    enrollments.filter(e => e.session_id === sessionId);

  const getInstructorName = (id: string | null) => {
    if (!id) return null;
    return instructors.find(i => i.id === id)?.name || null;
  };

  const assignInstructor = async (sessionIds: string[], instructorId: string) => {
    // Assign to all sessions in the slot at once
    const { error } = await supabase
      .from("swim_sessions")
      .update({ instructor_id: instructorId || null })
      .in("id", sessionIds);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Instructor assigned" });
      fetchData();
    }
  };

  const handleManualEnroll = async () => {
    const { child_name, child_age, parent_name, parent_email, swim_level, session_id } = manualForm;
    if (!child_name || !child_age || !parent_name || !parent_email || !session_id) {
      toast({ title: "Missing fields", description: "Fill all required fields", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("swim_enrollments").insert({
      child_name, child_age: parseInt(child_age), parent_name, parent_email,
      parent_phone: manualForm.parent_phone || null, swim_level, session_id,
      notes: manualForm.notes || null, status: "confirmed", registration_fee: 45,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Enrolled", description: `${child_name} has been enrolled.` });
      setManualOpen(false);
      setManualForm({ child_name: "", child_age: "", parent_name: "", parent_email: "", parent_phone: "", swim_level: "white", session_id: "", notes: "" });
      fetchData();
    }
  };

  const handleMoveSwimmer = async () => {
    if (!movingEnrollment || !newSessionId) return;
    const { error } = await supabase.from("swim_enrollments")
      .update({ session_id: newSessionId })
      .eq("id", movingEnrollment.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Moved", description: `${movingEnrollment.child_name} moved to new session.` });
      setMoveOpen(false);
      setMovingEnrollment(null);
      setNewSessionId("");
      fetchData();
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-display font-bold text-foreground">Class Roster</h2>
        <Dialog open={manualOpen} onOpenChange={setManualOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Manual Enroll</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Manual Enrollment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Child Name *</Label><Input value={manualForm.child_name} onChange={e => setManualForm(f => ({ ...f, child_name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Child Age *</Label><Input type="number" value={manualForm.child_age} onChange={e => setManualForm(f => ({ ...f, child_age: e.target.value }))} /></div>
                <div><Label>Swim Level *</Label>
                  <Select value={manualForm.swim_level} onValueChange={v => setManualForm(f => ({ ...f, swim_level: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["white","red","yellow","blue","green"] as SwimLevel[]).map(l => (
                        <SelectItem key={l} value={l}>{LEVEL_DISPLAY[l].name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Parent Name *</Label><Input value={manualForm.parent_name} onChange={e => setManualForm(f => ({ ...f, parent_name: e.target.value }))} /></div>
              <div><Label>Parent Email *</Label><Input type="email" value={manualForm.parent_email} onChange={e => setManualForm(f => ({ ...f, parent_email: e.target.value }))} /></div>
              <div><Label>Parent Phone</Label><Input value={manualForm.parent_phone} onChange={e => setManualForm(f => ({ ...f, parent_phone: e.target.value }))} /></div>
              <div><Label>Session *</Label>
                <Select value={manualForm.session_id} onValueChange={v => setManualForm(f => ({ ...f, session_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pick a session" /></SelectTrigger>
                  <SelectContent>
                    {sessions.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.session_name} · {formatTime(s.start_time)} · {LEVEL_DISPLAY[s.swim_level as SwimLevel]?.name || s.swim_level} · {s.age_group === "preschool-3-5" ? "Pre" : "SA"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notes</Label><Textarea value={manualForm.notes} onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <Button onClick={handleManualEnroll} className="w-full">Enroll Swimmer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterSession} onValueChange={setFilterSession}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Session" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sessions</SelectItem>
            {sessionNames.map(n => <SelectItem key={n!} value={n!}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAgeGroup} onValueChange={setFilterAgeGroup}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Age Group" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ages</SelectItem>
            <SelectItem value="preschool-3-5">Preschool</SelectItem>
            <SelectItem value="school-age-6-12">School-Age</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterLevel} onValueChange={setFilterLevel}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Level" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {(["white","red","yellow","blue","green"] as SwimLevel[]).map(l => (
              <SelectItem key={l} value={l}>{LEVEL_DISPLAY[l].name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterInstructor} onValueChange={setFilterInstructor}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Instructor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Instructors</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {instructors.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTime} onValueChange={setFilterTime}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Time" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Times</SelectItem>
            {uniqueTimes.map(t => <SelectItem key={t} value={t}>{formatTime(t)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {Object.entries(grouped).map(([key, slotSessions]) => {
        const first = slotSessions[0];
        const sessionName = first.session_name || "Session";
        const startTime = first.start_time;
        const endTime = first.end_time;
        const ageGroup = first.age_group || "";
        const dayOfWeek = first.day_of_week;
        const dateRange = formatDateRange(first.session_start_date, first.session_end_date);

        // Capacity is per time slot (3 total), NOT summed across levels
        const slotCapacity = first.max_students;
        const slotEnrollments = getEnrolledForSlot(slotSessions);
        const totalEnrolled = slotEnrollments.length;

        // Levels present in this slot
        const levels = [...new Set(slotSessions.map(s => s.swim_level))];
        const primaryLevel = levels[0] || "white";
        const borderColor = LEVEL_BORDER_COLORS[primaryLevel] || "border-l-gray-300";

        // Instructor (use first session — all in same slot should share)
        const instrId = first.instructor_id;
        const instrName = getInstructorName(instrId);

        return (
          <Card key={key} className={`border-l-4 ${borderColor}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base">
                    {sessionName} · {formatTime(startTime)} – {formatTime(endTime)}
                  </CardTitle>
                  {levels.map(l => {
                    const lc = LEVEL_BADGE_COLORS[l as SwimLevel];
                    return lc ? (
                      <span key={l} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${lc.bg} ${lc.text} ${lc.ring}`}>
                        {LEVEL_DISPLAY[l as SwimLevel]?.name}
                      </span>
                    ) : null;
                  })}
                  <Badge variant="outline" className={`text-xs ${ageGroup === "preschool-3-5" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-teal-50 text-teal-700 border-teal-200"}`}>
                    {ageGroup === "preschool-3-5" ? "Preschool" : "School-Age"}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <Select
                    value={instrId || "unassigned"}
                    onValueChange={v => assignInstructor(slotSessions.map(s => s.id), v === "unassigned" ? "" : v)}
                  >
                    <SelectTrigger className="h-7 text-xs w-[130px]">
                      <SelectValue placeholder="Assign instructor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {instructors.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1.5 text-sm">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className={totalEnrolled >= slotCapacity ? "text-destructive font-semibold" : "text-foreground"}>
                      {totalEnrolled}/{slotCapacity}
                    </span>
                  </div>
                </div>
              </div>
              {/* Day of week & date range */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDayOfWeek(dayOfWeek)}
                </span>
                {dateRange && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {dateRange}
                  </span>
                )}
                {instrName && (
                  <span className="text-primary font-medium">👤 {instrName}</span>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {slotEnrollments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 text-xs">Child</TableHead>
                      <TableHead className="h-8 text-xs">Age</TableHead>
                      <TableHead className="h-8 text-xs">Level</TableHead>
                      <TableHead className="h-8 text-xs">Parent</TableHead>
                      <TableHead className="h-8 text-xs">Status</TableHead>
                      <TableHead className="h-8 text-xs w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slotEnrollments.map(e => {
                      const lc = LEVEL_BADGE_COLORS[e.swim_level as SwimLevel];
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="py-2 text-sm">{e.child_name}</TableCell>
                          <TableCell className="py-2 text-sm">{e.child_age}</TableCell>
                          <TableCell className="py-2">
                            {lc ? (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ring-1 ${lc.bg} ${lc.text} ${lc.ring}`}>
                                {LEVEL_DISPLAY[e.swim_level as SwimLevel]?.name}
                              </span>
                            ) : (
                              <span className="text-xs">{e.swim_level}</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-sm">{e.parent_name}</TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline" className="text-xs capitalize">{e.status}</Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <Button size="icon" variant="ghost" className="h-7 w-7"
                              onClick={() => { setMovingEnrollment(e); setMoveOpen(true); }}>
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-3">No enrollments yet</p>
              )}
            </CardContent>
          </Card>
        );
      })}

      {Object.keys(grouped).length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No sessions match your filters.</p>
        </Card>
      )}

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Move {movingEnrollment?.child_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>New Session</Label>
            <Select value={newSessionId} onValueChange={setNewSessionId}>
              <SelectTrigger><SelectValue placeholder="Select new session" /></SelectTrigger>
              <SelectContent>
                {sessions.filter(s => s.id !== movingEnrollment?.session_id).map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.session_name} · {formatTime(s.start_time)} · {LEVEL_DISPLAY[s.swim_level as SwimLevel]?.name || s.swim_level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleMoveSwimmer} className="w-full" disabled={!newSessionId}>
              Move Swimmer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClassRosterAdmin;
