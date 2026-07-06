import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Download } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";
import SessionGapOutreach from "@/components/admin/SessionGapOutreach";

interface Instructor { id: string; name: string; }
interface Attendance { enrollment_id: string; session_id: string; lesson_date: string; checked_in: boolean; }
interface SwimSession { id: string; instructor_id: string | null; swim_level: string; session_name: string | null; }
interface Enrollment { id: string; child_name: string; session_id: string | null; status: string; }

const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export default function ReportsAdmin() {
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(format(startOfMonth(subMonths(new Date(), 0)), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));

  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [sessions, setSessions] = useState<SwimSession[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);

  const load = async () => {
    setLoading(true);
    const [iRes, aRes, ssRes, eRes] = await Promise.all([
      supabase.from("instructors").select("id,name"),
      supabase.from("attendance").select("enrollment_id,session_id,lesson_date,checked_in")
        .gte("lesson_date", from).lte("lesson_date", to),
      supabase.from("swim_sessions").select("id,instructor_id,swim_level,session_name"),
      supabase.from("swim_enrollments").select("id,child_name,session_id,status"),
    ]);
    setInstructors((iRes.data ?? []) as Instructor[]);
    setAttendance((aRes.data ?? []) as Attendance[]);
    setSessions((ssRes.data ?? []) as SwimSession[]);
    setEnrollments((eRes.data ?? []) as Enrollment[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [from, to]);

  const instMap = useMemo(() => Object.fromEntries(instructors.map((i) => [i.id, i])), [instructors]);
  const sessMap = useMemo(() => Object.fromEntries(sessions.map((s) => [s.id, s])), [sessions]);
  const enrMap = useMemo(() => Object.fromEntries(enrollments.map((e) => [e.id, e])), [enrollments]);

  const noShows = useMemo(() => {
    const list = attendance.filter((a) => !a.checked_in).map((a) => {
      const sess = sessMap[a.session_id];
      const enr = enrMap[a.enrollment_id];
      return {
        date: a.lesson_date,
        child: enr?.child_name ?? "—",
        session: sess?.session_name || sess?.swim_level || "—",
        instructor: sess?.instructor_id ? (instMap[sess.instructor_id]?.name ?? "—") : "—",
      };
    });
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [attendance, sessMap, enrMap, instMap]);

  const enrollmentByLevel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of enrollments) {
      if (e.status === "cancelled") continue;
      const sess = e.session_id ? sessMap[e.session_id] : null;
      const key = sess?.swim_level ?? "Unassigned";
      map[key] = (map[key] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [enrollments, sessMap]);

  const exportNoShows = () => {
    const rows: (string | number)[][] = [["Date", "Child", "Class", "Instructor"]];
    noShows.forEach((n) => rows.push([n.date, n.child, n.session, n.instructor]));
    downloadCsv(`no-shows-${from}-to-${to}.csv`, rows);
  };

  const exportEnrollments = () => {
    const rows: (string | number)[][] = [["Level", "Active enrollments"]];
    enrollmentByLevel.forEach(([k, v]) => rows.push([k, v]));
    downloadCsv(`enrollments-${from}-to-${to}.csv`, rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            No-shows and enrollment trends.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            setFrom(format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"));
            setTo(format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"));
          }}>Last month</Button>
          <Button variant="outline" size="sm" onClick={() => {
            setFrom(format(startOfMonth(new Date()), "yyyy-MM-dd"));
            setTo(format(endOfMonth(new Date()), "yyyy-MM-dd"));
          }}>This month</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">No-shows</div>
          <div className="text-2xl font-semibold">{noShows.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Active enrollments</div>
          <div className="text-2xl font-semibold">
            {enrollments.filter((e) => e.status !== "cancelled").length}
          </div>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <Tabs defaultValue="noshows">
          <TabsList>
            <TabsTrigger value="noshows">No-shows</TabsTrigger>
            <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
            <TabsTrigger value="gap">Session gap outreach</TabsTrigger>
          </TabsList>

          <TabsContent value="gap">
            <SessionGapOutreach />
          </TabsContent>

          <TabsContent value="noshows">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">No-shows ({noShows.length})</h3>
                <Button size="sm" variant="outline" onClick={exportNoShows}><Download className="w-3 h-3 mr-1" />CSV</Button>
              </div>
              {noShows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No missed lessons in this range. 🎉</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr><th className="text-left py-2">Date</th><th className="text-left">Child</th><th className="text-left">Class</th><th className="text-left">Instructor</th></tr>
                  </thead>
                  <tbody>
                    {noShows.slice(0, 200).map((n, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2">{format(parseISO(n.date), "MMM d, yyyy")}</td>
                        <td>{n.child}</td>
                        <td>{n.session}</td>
                        <td>{n.instructor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="enrollments">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Active enrollments by level</h3>
                <Button size="sm" variant="outline" onClick={exportEnrollments}><Download className="w-3 h-3 mr-1" />CSV</Button>
              </div>
              {enrollmentByLevel.length === 0 ? (
                <p className="text-sm text-muted-foreground">No enrollments.</p>
              ) : (
                <div className="space-y-1">
                  {enrollmentByLevel.map(([level, count]) => {
                    const max = enrollmentByLevel[0][1];
                    const pct = (count / max) * 100;
                    return (
                      <div key={level} className="flex items-center gap-3 text-sm">
                        <div className="w-40 truncate">{level}</div>
                        <div className="flex-1 bg-muted rounded h-5 overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="w-12 text-right font-medium">{count}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
