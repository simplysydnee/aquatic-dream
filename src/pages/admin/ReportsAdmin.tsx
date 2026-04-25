import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";

interface Punch {
  id: string;
  instructor_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  break_minutes: number;
  status: string;
}
interface Shift {
  id: string;
  instructor_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: string;
}
interface Instructor { id: string; name: string; hourly_wage: number | null; }
interface Attendance { enrollment_id: string; session_id: string; lesson_date: string; checked_in: boolean; }
interface SwimSession { id: string; instructor_id: string | null; swim_level: string; session_name: string | null; }
interface Enrollment { id: string; child_name: string; session_id: string | null; status: string; }

const punchHours = (p: Punch) => {
  if (!p.clock_out_at) return 0;
  const ms = new Date(p.clock_out_at).getTime() - new Date(p.clock_in_at).getTime() - (p.break_minutes ?? 0) * 60_000;
  return Math.max(0, ms / 3_600_000);
};

const shiftHours = (s: Shift) => {
  const [sh, sm] = s.start_time.split(":").map(Number);
  const [eh, em] = s.end_time.split(":").map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
};

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
  const [punches, setPunches] = useState<Punch[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [sessions, setSessions] = useState<SwimSession[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);

  const load = async () => {
    setLoading(true);
    const fromDt = `${from}T00:00:00Z`;
    const toDt = `${to}T23:59:59Z`;
    const [iRes, pRes, sRes, aRes, ssRes, eRes] = await Promise.all([
      supabase.from("instructors").select("id,name,hourly_wage"),
      supabase.from("time_clock_entries").select("id,instructor_id,clock_in_at,clock_out_at,break_minutes,status")
        .gte("clock_in_at", fromDt).lte("clock_in_at", toDt),
      supabase.from("shifts").select("id,instructor_id,shift_date,start_time,end_time,status")
        .gte("shift_date", from).lte("shift_date", to),
      supabase.from("attendance").select("enrollment_id,session_id,lesson_date,checked_in")
        .gte("lesson_date", from).lte("lesson_date", to),
      supabase.from("swim_sessions").select("id,instructor_id,swim_level,session_name"),
      supabase.from("swim_enrollments").select("id,child_name,session_id,status"),
    ]);
    setInstructors((iRes.data ?? []) as Instructor[]);
    setPunches((pRes.data ?? []) as Punch[]);
    setShifts((sRes.data ?? []) as Shift[]);
    setAttendance((aRes.data ?? []) as Attendance[]);
    setSessions((ssRes.data ?? []) as SwimSession[]);
    setEnrollments((eRes.data ?? []) as Enrollment[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [from, to]);

  const instMap = useMemo(() => Object.fromEntries(instructors.map((i) => [i.id, i])), [instructors]);
  const sessMap = useMemo(() => Object.fromEntries(sessions.map((s) => [s.id, s])), [sessions]);
  const enrMap = useMemo(() => Object.fromEntries(enrollments.map((e) => [e.id, e])), [enrollments]);

  // Hours & labor cost (approved + pending punches)
  const hoursReport = useMemo(() => {
    const map: Record<string, { hours: number; cost: number; approved: number; pending: number }> = {};
    for (const p of punches) {
      if (!p.clock_out_at) continue;
      const inst = instMap[p.instructor_id];
      const hrs = punchHours(p);
      const wage = Number(inst?.hourly_wage ?? 0);
      const t = map[p.instructor_id] ||= { hours: 0, cost: 0, approved: 0, pending: 0 };
      t.hours += hrs;
      t.cost += hrs * wage;
      if (p.status === "approved") t.approved += hrs;
      if (p.status === "pending") t.pending += hrs;
    }
    return map;
  }, [punches, instMap]);

  // Scheduled vs worked variance
  const varianceReport = useMemo(() => {
    const sched: Record<string, number> = {};
    for (const s of shifts) {
      if (!s.instructor_id) continue;
      sched[s.instructor_id] = (sched[s.instructor_id] ?? 0) + shiftHours(s);
    }
    const out: { id: string; scheduled: number; worked: number; variance: number }[] = [];
    const ids = new Set([...Object.keys(sched), ...Object.keys(hoursReport)]);
    ids.forEach((id) => {
      const scheduled = sched[id] ?? 0;
      const worked = hoursReport[id]?.hours ?? 0;
      out.push({ id, scheduled, worked, variance: worked - scheduled });
    });
    return out.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  }, [shifts, hoursReport]);

  // No-shows from attendance
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

  // Enrollment summary
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

  const grandHours = Object.values(hoursReport).reduce((s, t) => s + t.hours, 0);
  const grandCost = Object.values(hoursReport).reduce((s, t) => s + t.cost, 0);
  const totalScheduled = Object.values(varianceReport).reduce((s, t) => s + t.scheduled, 0);

  const exportHours = () => {
    const rows: (string | number)[][] = [["Instructor", "Hours worked", "Approved hrs", "Pending hrs", "Wage", "Labor cost"]];
    Object.entries(hoursReport).forEach(([id, t]) => {
      const inst = instMap[id];
      rows.push([inst?.name ?? "Unknown", t.hours.toFixed(2), t.approved.toFixed(2), t.pending.toFixed(2), Number(inst?.hourly_wage ?? 0).toFixed(2), t.cost.toFixed(2)]);
    });
    downloadCsv(`hours-${from}-to-${to}.csv`, rows);
  };

  const exportNoShows = () => {
    const rows: (string | number)[][] = [["Date", "Child", "Class", "Instructor"]];
    noShows.forEach((n) => rows.push([n.date, n.child, n.session, n.instructor]));
    downloadCsv(`no-shows-${from}-to-${to}.csv`, rows);
  };

  const exportVariance = () => {
    const rows: (string | number)[][] = [["Instructor", "Scheduled", "Worked", "Variance"]];
    varianceReport.forEach((r) => {
      rows.push([instMap[r.id]?.name ?? "Unknown", r.scheduled.toFixed(2), r.worked.toFixed(2), r.variance.toFixed(2)]);
    });
    downloadCsv(`variance-${from}-to-${to}.csv`, rows);
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
            Hours, labor cost, no-shows, and enrollment trends.
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Hours worked</div>
          <div className="text-2xl font-semibold">{grandHours.toFixed(1)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Labor cost</div>
          <div className="text-2xl font-semibold">${grandCost.toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Scheduled hours</div>
          <div className="text-2xl font-semibold">{totalScheduled.toFixed(1)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">No-shows</div>
          <div className="text-2xl font-semibold">{noShows.length}</div>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <Tabs defaultValue="hours">
          <TabsList>
            <TabsTrigger value="hours">Hours & cost</TabsTrigger>
            <TabsTrigger value="variance">Schedule vs actual</TabsTrigger>
            <TabsTrigger value="noshows">No-shows</TabsTrigger>
            <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
          </TabsList>

          <TabsContent value="hours">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Hours & labor cost by instructor</h3>
                <Button size="sm" variant="outline" onClick={exportHours}><Download className="w-3 h-3 mr-1" />CSV</Button>
              </div>
              {Object.keys(hoursReport).length === 0 ? (
                <p className="text-sm text-muted-foreground">No punches in this range.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr><th className="text-left py-2">Instructor</th><th className="text-right">Hours</th><th className="text-right">Approved</th><th className="text-right">Pending</th><th className="text-right">Wage</th><th className="text-right">Cost</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(hoursReport).sort((a, b) => b[1].cost - a[1].cost).map(([id, t]) => {
                      const inst = instMap[id];
                      return (
                        <tr key={id} className="border-b last:border-0">
                          <td className="py-2">{inst?.name ?? "Unknown"}</td>
                          <td className="text-right">{t.hours.toFixed(2)}</td>
                          <td className="text-right text-emerald-700">{t.approved.toFixed(2)}</td>
                          <td className="text-right text-amber-700">{t.pending.toFixed(2)}</td>
                          <td className="text-right">{inst?.hourly_wage != null ? `$${Number(inst.hourly_wage).toFixed(2)}` : "—"}</td>
                          <td className="text-right font-medium">${t.cost.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="variance">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Scheduled vs worked</h3>
                <Button size="sm" variant="outline" onClick={exportVariance}><Download className="w-3 h-3 mr-1" />CSV</Button>
              </div>
              {varianceReport.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr><th className="text-left py-2">Instructor</th><th className="text-right">Scheduled</th><th className="text-right">Worked</th><th className="text-right">Variance</th></tr>
                  </thead>
                  <tbody>
                    {varianceReport.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2">{instMap[r.id]?.name ?? "Unknown"}</td>
                        <td className="text-right">{r.scheduled.toFixed(2)}</td>
                        <td className="text-right">{r.worked.toFixed(2)}</td>
                        <td className={`text-right font-medium ${r.variance < 0 ? "text-rose-700" : r.variance > 0 ? "text-amber-700" : ""}`}>
                          {r.variance > 0 ? "+" : ""}{r.variance.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
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
