import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";
import { CheckCircle2, Undo2, Search, Tablet, RotateCw, UserX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface SessionInfo {
  id: string;
  start_time: string;
  end_time: string;
  swim_level: string;
  age_group: string | null;
  session_name: string | null;
}

interface EnrollmentRow {
  id: string;
  session_id: string;
  child_name: string;
  child_age: number;
  parent_name: string;
  parent_phone: string | null;
  checked_in: boolean;
  no_show: boolean;
  notes: string | null;
}

interface Group {
  session: SessionInfo;
  enrollments: EnrollmentRow[];
}

const CheckInAdmin = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = new Date();
  const dateStr = format(today, "yyyy-MM-dd");
  const dayName = format(today, "EEEE");

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const checkedInBy = `admin:${user?.email || "unknown"}`;

  const fetchData = async () => {
    setLoading(true);
    const [sessionsRes, enrollRes, attendanceRes] = await Promise.all([
      supabase
        .from("swim_sessions")
        .select("id, start_time, end_time, swim_level, age_group, session_name")
        .eq("is_active", true)
        .eq("day_of_week", dayName),
      supabase
        .from("swim_enrollments")
        .select("id, session_id, child_name, child_age, parent_name, parent_phone, status")
        .in("status", ["pending", "confirmed", "enrolled"]),
      supabase
        .from("attendance")
        .select("enrollment_id, checked_in, notes")
        .eq("lesson_date", dateStr),
    ]);

    const sessions = (sessionsRes.data || []) as SessionInfo[];
    const enrollments = (enrollRes.data || []) as any[];
    const attMap = new Map<string, { checked_in: boolean; notes: string | null }>(
      (attendanceRes.data || []).map((a: any) => [a.enrollment_id, { checked_in: !!a.checked_in, notes: a.notes }]),
    );

    const grouped: Group[] = sessions
      .map((s) => ({
        session: s,
        enrollments: enrollments
          .filter((e) => e.session_id === s.id)
          .map((e) => {
            const a = attMap.get(e.id);
            return {
              id: e.id,
              session_id: e.session_id,
              child_name: e.child_name,
              child_age: e.child_age,
              parent_name: e.parent_name,
              parent_phone: e.parent_phone,
              checked_in: a?.checked_in ?? false,
              no_show: a?.notes === "no_show",
              notes: a?.notes ?? null,
            } as EnrollmentRow;
          }),
      }))
      .filter((g) => g.enrollments.length > 0)
      .sort((a, b) => a.session.start_time.localeCompare(b.session.start_time));

    setGroups(grouped);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAttendance = async (
    enr: EnrollmentRow,
    next: { checked_in: boolean; notes: string | null },
  ) => {
    setBusyId(enr.id);
    const { error } = await supabase.from("attendance").upsert(
      {
        enrollment_id: enr.id,
        session_id: enr.session_id,
        lesson_date: dateStr,
        checked_in: next.checked_in,
        checked_in_at: next.checked_in ? new Date().toISOString() : null,
        checked_in_by: checkedInBy,
        notes: next.notes,
      },
      { onConflict: "enrollment_id,lesson_date" },
    );
    setBusyId(null);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        enrollments: g.enrollments.map((e) =>
          e.id === enr.id ? { ...e, checked_in: next.checked_in, no_show: next.notes === "no_show", notes: next.notes } : e,
        ),
      })),
    );
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        enrollments: g.enrollments.filter(
          (e) =>
            e.child_name.toLowerCase().includes(q) ||
            (e.parent_name || "").toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.enrollments.length > 0);
  }, [groups, search]);

  const totals = groups.reduce(
    (acc, g) => {
      acc.total += g.enrollments.length;
      acc.checked += g.enrollments.filter((e) => e.checked_in).length;
      acc.noshow += g.enrollments.filter((e) => e.no_show).length;
      return acc;
    },
    { total: 0, checked: 0, noshow: 0 },
  );

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Check-in</h2>
          <p className="text-sm text-muted-foreground">
            {format(today, "EEEE, MMMM d, yyyy")} · {totals.checked}/{totals.total} checked in
            {totals.noshow > 0 && ` · ${totals.noshow} no-show`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RotateCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button asChild size="sm">
            <a href="/checkin" target="_blank" rel="noreferrer">
              <Tablet className="w-4 h-4 mr-1.5" /> Open Kiosk
            </a>
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search swimmer or parent name…"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No swimmers scheduled for today.
          </CardContent>
        </Card>
      ) : (
        filtered.map((g) => {
          const levelInfo = LEVEL_DISPLAY[g.session.swim_level as SwimLevel];
          const checked = g.enrollments.filter((e) => e.checked_in).length;
          return (
            <Card key={g.session.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-lg">
                      {format(new Date(`2000-01-01T${g.session.start_time}`), "h:mm a")}
                    </span>
                    <Badge variant="outline" className={levelInfo?.color || ""}>
                      {levelInfo?.name || g.session.swim_level}
                    </Badge>
                    {g.session.session_name && (
                      <span className="text-xs text-muted-foreground">{g.session.session_name}</span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {checked}/{g.enrollments.length} checked in
                  </span>
                </div>

                <div className="space-y-2">
                  {g.enrollments.map((e) => {
                    const busy = busyId === e.id;
                    return (
                      <div
                        key={e.id}
                        className={`flex items-center justify-between gap-2 p-2.5 rounded border ${
                          e.checked_in
                            ? "bg-green-50 border-green-200"
                            : e.no_show
                            ? "bg-red-50 border-red-200"
                            : "border-border"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{e.child_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            Age {e.child_age} · {e.parent_name}
                            {e.parent_phone ? ` · ${e.parent_phone}` : ""}
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {e.checked_in ? (
                            <>
                              <Badge className="bg-green-600 hover:bg-green-600">
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> In
                              </Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => setAttendance(e, { checked_in: false, notes: null })}
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => setAttendance(e, { checked_in: true, notes: null })}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Check in
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  setAttendance(e, {
                                    checked_in: false,
                                    notes: e.no_show ? null : "no_show",
                                  })
                                }
                              >
                                <UserX className="w-3.5 h-3.5 mr-1" />
                                {e.no_show ? "Clear" : "No-show"}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};

export default CheckInAdmin;
