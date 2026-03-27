import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";

interface Enrollment {
  id: string;
  child_name: string;
  child_age: number;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  swim_level: string;
  status: string;
  notes: string | null;
  created_at: string;
  session_id: string | null;
}

interface SessionInfo {
  id: string;
  start_time: string;
  session_name: string | null;
  age_group: string | null;
  swim_level: string;
}

const SwimEnrollmentsAdmin = () => {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [sessions, setSessions] = useState<Record<string, SessionInfo>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [enrollRes, sessionRes] = await Promise.all([
      supabase.from("swim_enrollments").select("*").order("created_at", { ascending: false }),
      supabase.from("swim_sessions").select("id, start_time, session_name, age_group, swim_level"),
    ]);

    if (enrollRes.data) setEnrollments(enrollRes.data);
    if (sessionRes.data) {
      const map: Record<string, SessionInfo> = {};
      sessionRes.data.forEach((s: any) => (map[s.id] = s));
      setSessions(map);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("swim_enrollments").update({ status }).eq("id", id);
    setEnrollments((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-green-100 text-green-700 border-green-300";
      case "cancelled": return "bg-red-100 text-red-700 border-red-300";
      default: return "bg-yellow-100 text-yellow-700 border-yellow-300";
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold text-foreground">Swim Enrollments</h2>
        <Badge variant="outline" className="text-sm">{enrollments.length} total</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {["pending", "confirmed", "cancelled"].map((status) => {
          const count = enrollments.filter((e) => e.status === status).length;
          return (
            <Card key={status}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium capitalize text-muted-foreground">{status}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Child</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.map((e) => {
                const levelInfo = LEVEL_DISPLAY[e.swim_level as SwimLevel];
                const session = e.session_id ? sessions[e.session_id] : null;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.child_name}</TableCell>
                    <TableCell>{e.child_age}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={levelInfo?.color || ""}>
                        {levelInfo?.name || e.swim_level}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>{e.parent_name}</div>
                      <div className="text-xs text-muted-foreground">{e.parent_email}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {session ? `${session.session_name || ""} ${session.start_time}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Select value={e.status} onValueChange={(v) => updateStatus(e.id, v)}>
                        <SelectTrigger className="w-[120px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(e.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })}
              {enrollments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No enrollments yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SwimEnrollmentsAdmin;
