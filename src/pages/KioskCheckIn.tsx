import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";
import { Waves, CheckCircle2 } from "lucide-react";

interface SessionGroup {
  session: {
    id: string;
    start_time: string;
    end_time: string;
    swim_level: string;
    age_group: string | null;
  };
  enrollments: {
    id: string;
    child_name: string;
    child_age: number;
    parent_name: string;
    checked_in: boolean;
    checked_in_at: string | null;
  }[];
}

type Phase = "now" | "upcoming" | "done";

const phaseFor = (start: string, end: string, now: Date): Phase => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  if (minutes >= s && minutes < e) return "now";
  if (minutes < s) return "upcoming";
  return "done";
};

const daysForToday = (d: Date): string[] => {
  switch (format(d, "EEEE")) {
    case "Monday": return ["monday", "monday_wednesday"];
    case "Tuesday": return ["tuesday", "tuesday_thursday"];
    case "Wednesday": return ["wednesday", "monday_wednesday"];
    case "Thursday": return ["thursday", "tuesday_thursday"];
    case "Friday": return ["friday"];
    case "Saturday": return ["saturday"];
    case "Sunday": return ["sunday"];
    default: return [];
  }
};

const KioskCheckIn = () => {
  const [sessionGroups, setSessionGroups] = useState<SessionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const today = new Date();
  const dateStr = format(today, "yyyy-MM-dd");

  const fetchData = async () => {
    const [sessionsRes, enrollmentsRes, attendanceRes] = await Promise.all([
      supabase
        .from("swim_sessions")
        .select("id, start_time, end_time, swim_level, age_group")
        .eq("is_active", true)
        .in("day_of_week", daysForToday(today)),
      supabase
        .from("swim_enrollments")
        .select("id, child_name, child_age, parent_name, session_id, status")
        .in("status", ["pending", "confirmed"]),
      supabase
        .from("attendance")
        .select("enrollment_id, checked_in, checked_in_at")
        .eq("lesson_date", dateStr),
    ]);

    const sessions = sessionsRes.data || [];
    const enrollments = enrollmentsRes.data || [];
    const attendanceMap = new Map(
      (attendanceRes.data || []).map((a: any) => [
        a.enrollment_id,
        { checked_in: a.checked_in, checked_in_at: a.checked_in_at },
      ])
    );

    const groups: SessionGroup[] = sessions
      .map((session) => ({
        session,
        enrollments: enrollments
          .filter((e) => e.session_id === session.id)
          .map((e) => {
            const a = attendanceMap.get(e.id);
            return {
              ...e,
              checked_in: a?.checked_in || false,
              checked_in_at: a?.checked_in_at || null,
            };
          }),
      }))
      .filter((g) => g.enrollments.length > 0);

    setSessionGroups(groups);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const refresh = setInterval(fetchData, 30_000);
    const reorder = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => {
      clearInterval(refresh);
      clearInterval(reorder);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orderedGroups = useMemo(() => {
    const now = new Date();
    const rank: Record<Phase, number> = { now: 0, upcoming: 1, done: 2 };
    return [...sessionGroups]
      .map((g) => ({ ...g, phase: phaseFor(g.session.start_time, g.session.end_time, now) }))
      .sort((a, b) => {
        if (rank[a.phase] !== rank[b.phase]) return rank[a.phase] - rank[b.phase];
        return a.session.start_time.localeCompare(b.session.start_time);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionGroups, tick]);

  const handleCheckIn = async (enrollmentId: string, sessionId: string) => {
    // optimistic
    setSessionGroups((prev) =>
      prev.map((g) => ({
        ...g,
        enrollments: g.enrollments.map((e) =>
          e.id === enrollmentId
            ? { ...e, checked_in: true, checked_in_at: new Date().toISOString() }
            : e
        ),
      }))
    );
    await supabase.from("attendance").upsert(
      {
        enrollment_id: enrollmentId,
        session_id: sessionId,
        lesson_date: dateStr,
        checked_in: true,
        checked_in_at: new Date().toISOString(),
        checked_in_by: "kiosk",
      },
      { onConflict: "enrollment_id,lesson_date" }
    );
    fetchData();
  };

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div className="text-center flex-1">
            <Waves className="w-10 h-10 text-primary mx-auto mb-2" />
            <h1 className="text-3xl font-display font-bold text-foreground">
              Swim Check-In
            </h1>
            <p className="text-muted-foreground">
              {format(today, "EEEE, MMMM d, yyyy")} · Tap your child's name
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link to="/admin">Exit</Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : orderedGroups.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground">No lessons scheduled today</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {orderedGroups.map((group) => {
              const levelInfo = LEVEL_DISPLAY[group.session.swim_level as SwimLevel];
              const isDone = group.phase === "done";
              const isNow = group.phase === "now";
              return (
                <Card
                  key={group.session.id}
                  className={`transition-all ${
                    isNow ? "border-primary border-2 shadow-md" : ""
                  } ${isDone ? "opacity-50" : ""}`}
                >
                  <CardContent className="p-4 md:p-5">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-3 pb-3 border-b">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-xl">
                          {format(
                            new Date(`2000-01-01T${group.session.start_time}`),
                            "h:mm a"
                          )}
                        </span>
                        <Badge variant="outline" className={levelInfo?.color || ""}>
                          {levelInfo?.name || group.session.swim_level}
                        </Badge>
                        {isNow && (
                          <Badge className="bg-primary text-primary-foreground">
                            Now
                          </Badge>
                        )}
                        {isDone && (
                          <Badge variant="secondary">Finished</Badge>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {group.enrollments.filter((e) => e.checked_in).length}/
                        {group.enrollments.length} checked in
                      </span>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-2">
                      {group.enrollments.map((enr) => (
                        <button
                          key={enr.id}
                          disabled={enr.checked_in || isDone}
                          onClick={() => handleCheckIn(enr.id, group.session.id)}
                          className={`text-left rounded-lg border p-3 transition-all ${
                            enr.checked_in
                              ? "bg-green-50 border-green-200 cursor-default"
                              : isDone
                              ? "cursor-not-allowed"
                              : "hover:border-primary hover:shadow-sm active:scale-[0.99]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-lg truncate">
                                {enr.child_name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {enr.checked_in && enr.checked_in_at
                                  ? `Checked in ${format(
                                      new Date(enr.checked_in_at),
                                      "h:mm a"
                                    )}`
                                  : `Age ${enr.child_age} · ${enr.parent_name}`}
                              </p>
                            </div>
                            {enr.checked_in ? (
                              <CheckCircle2 className="w-7 h-7 text-green-500 shrink-0" />
                            ) : (
                              <span className="text-xs font-semibold text-primary shrink-0">
                                CHECK IN
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
};

export default KioskCheckIn;
