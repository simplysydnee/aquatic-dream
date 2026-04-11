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
import { Users, Plus, ArrowRightLeft, Loader2 } from "lucide-react";
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

  const filteredSessions = sessions.filter(s => {
    if (filterSession !== "all" && s.session_name !== filterSession) return false;
    if (filterAgeGroup !== "all" && s.age_group !== filterAgeGroup) return false;
    return true;
  });

  const grouped = filteredSessions.reduce<Record<string, Session[]>>((acc, s) => {
    const key = `${s.session_name}|${s.start_time}|${s.age_group}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const getEnrolledCount = (sessionId: string) =>
    enrollments.filter(e => e.session_id === sessionId).length;

  const getSessionEnrollments = (sessionId: string) =>
    enrollments.filter(e => e.session_id === sessionId);

  const getInstructorName = (id: string | null) => {
    if (!id) return null;
    return instructors.find(i => i.id === id)?.name || null;
  };

  const assignInstructor = async (sessionId: string, instructorId: string) => {
    const { error } = await supabase
      .from("swim_sessions")
      .update({ instructor_id: instructorId || null })
      .eq("id", sessionId);
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
        <div className="flex items-center gap-3">
          <Select value={filterSession} onValueChange={setFilterSession}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Session" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sessions</SelectItem>
              {sessionNames.map(n => <SelectItem key={n!} value={n!}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterAgeGroup} onValueChange={setFilterAgeGroup}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Age Group" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ages</SelectItem>
              <SelectItem value="preschool-3-5">Preschool</SelectItem>
              <SelectItem value="school-age-6-12">School-Age</SelectItem>
            </SelectContent>
          </Select>
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
      </div>

      {Object.entries(grouped).map(([key, slotSessions]) => {
        const [sessionName, startTime, ageGroup] = key.split("|");
        const totalCapacity = slotSessions.reduce((sum, s) => sum + s.max_students, 0);
        const totalEnrolled = slotSessions.reduce((sum, s) => sum + getEnrolledCount(s.id), 0);
        // Use first session's level for the border color
        const primaryLevel = slotSessions[0]?.swim_level || "white";
        const borderColor = LEVEL_BORDER_COLORS[primaryLevel] || "border-l-gray-300";

        return (
          <Card key={key} className={`border-l-4 ${borderColor}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base">{sessionName} · {formatTime(startTime)}</CardTitle>
                  {slotSessions.map(s => {
                    const lc = LEVEL_BADGE_COLORS[s.swim_level as SwimLevel];
                    return lc ? (
                      <span key={s.id} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${lc.bg} ${lc.text} ${lc.ring}`}>
                        {LEVEL_DISPLAY[s.swim_level as SwimLevel]?.name}
                      </span>
                    ) : null;
                  })}
                  <Badge variant="outline" className={`text-xs ${ageGroup === "preschool-3-5" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-teal-50 text-teal-700 border-teal-200"}`}>
                    {ageGroup === "preschool-3-5" ? "Preschool" : "School-Age"}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  {/* Instructor assignment */}
                  {slotSessions.map(s => {
                    const instrName = getInstructorName(s.instructor_id);
                    return (
                      <Select key={s.id} value={s.instructor_id || ""} onValueChange={v => assignInstructor(s.id, v)}>
                        <SelectTrigger className="h-7 text-xs w-[130px]">
                          <SelectValue placeholder="Assign instructor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Unassigned</SelectItem>
                          {instructors.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    );
                  }).filter((_, i) => i === 0 /* show one dropdown per slot */)}
                  <div className="flex items-center gap-1.5 text-sm">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className={totalEnrolled >= totalCapacity ? "text-destructive font-semibold" : "text-foreground"}>
                      {totalEnrolled}/{totalCapacity}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {slotSessions.map(session => {
                const enrolled = getSessionEnrollments(session.id);
                if (enrolled.length === 0) return null;
                const lc = LEVEL_BADGE_COLORS[session.swim_level as SwimLevel];
                return (
                  <div key={session.id} className="mb-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      {lc && <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${lc.bg} ring-1 ${lc.ring}`} />}
                      {LEVEL_DISPLAY[session.swim_level as SwimLevel]?.name} ({enrolled.length}/{session.max_students})
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-xs">Child</TableHead>
                          <TableHead className="h-8 text-xs">Age</TableHead>
                          <TableHead className="h-8 text-xs">Parent</TableHead>
                          <TableHead className="h-8 text-xs">Status</TableHead>
                          <TableHead className="h-8 text-xs w-[40px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {enrolled.map(e => (
                          <TableRow key={e.id}>
                            <TableCell className="py-2 text-sm">{e.child_name}</TableCell>
                            <TableCell className="py-2 text-sm">{e.child_age}</TableCell>
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
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
              {slotSessions.every(s => getSessionEnrollments(s.id).length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-3">No enrollments yet</p>
              )}
            </CardContent>
          </Card>
        );
      })}

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
