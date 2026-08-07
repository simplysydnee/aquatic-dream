import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import AdultTag from "@/components/admin/AdultTag";

interface SwimSession {
  id: string;
  swim_level: string;
  age_group: string | null;
  start_time: string;
  end_time: string;
  day_of_week: string;
  session_name: string | null;
  max_students: number;
}
interface Enrollment {
  id: string;
  child_name: string;
  child_age: number;
  child_dob: string | null;
  swim_level: string;
  session_id: string | null;
  status: string;
  medical_notes: string | null;
  is_first_time: boolean;
}

const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${m.toString().padStart(2, "0")} ${period}`;
};

export default function InstructorMyRoster() {
  const [sessions, setSessions] = useState<SwimSession[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: instId } = await supabase.rpc("current_user_instructor_id" as any);
      const id = (instId as string) || null;
      if (!id) { setLinked(false); setLoading(false); return; }

      const sessRes = await supabase
        .from("swim_sessions")
        .select("id, swim_level, age_group, start_time, end_time, day_of_week, session_name, max_students")
        .eq("instructor_id", id).eq("is_active", true)
        .order("day_of_week").order("start_time");
      setSessions(sessRes.data ?? []);

      const sessionIds = (sessRes.data ?? []).map((s) => s.id);
      if (sessionIds.length) {
        const enrRes = await supabase
          .from("swim_enrollments")
          .select("id, child_name, child_age, child_dob, swim_level, session_id, status, medical_notes, is_first_time")
          .in("session_id", sessionIds)
          .in("status", ["confirmed", "pending"])
          .order("child_name");
        setEnrollments(enrRes.data ?? []);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  if (!linked) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Your account isn’t linked to an instructor record yet. Please ask an admin to link it.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">My Class Rosters</h2>
        <p className="text-sm text-muted-foreground">All currently-active classes assigned to you.</p>
      </div>

      {sessions.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No classes assigned yet.
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {sessions.map((sess) => {
          const roster = enrollments.filter((e) => e.session_id === sess.id);
          return (
            <Card key={sess.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>
                    {sess.session_name || `${sess.swim_level}${sess.age_group ? " · " + sess.age_group : ""}`}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {roster.length}/{sess.max_students}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {sess.day_of_week} · {fmtTime(sess.start_time)} – {fmtTime(sess.end_time)} · {sess.swim_level}
                </p>
              </CardHeader>
              <CardContent className="space-y-1">
                {roster.length === 0 && <p className="text-xs text-muted-foreground">No swimmers yet.</p>}
                {roster.map((e) => (
                  <div key={e.id} className="flex items-start justify-between text-sm border-b last:border-0 py-1.5">
                    <div>
                      <div className="font-medium flex items-center gap-1">
                        {e.child_name} <span className="text-xs text-muted-foreground">· age {e.child_age}</span>
                        <AdultTag dob={e.child_dob} />
                      </div>
                      {e.medical_notes && (
                        <div className="text-xs text-amber-700 mt-0.5">⚠ {e.medical_notes}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {e.is_first_time && <Badge variant="secondary" className="text-[10px]">New</Badge>}
                      <Badge variant={e.status === "confirmed" ? "default" : "outline"} className="text-[10px]">
                        {e.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
