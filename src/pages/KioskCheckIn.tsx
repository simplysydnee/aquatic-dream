import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";
import { Lock, Waves, CheckCircle2, ArrowLeft } from "lucide-react";

const KIOSK_PIN = "1234"; // TODO: make configurable

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
  }[];
}

const KioskCheckIn = () => {
  const [pin, setPin] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [sessionGroups, setSessionGroups] = useState<SessionGroup[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const dateStr = format(today, "yyyy-MM-dd");
  const dayName = format(today, "EEEE");

  const fetchData = async () => {
    setLoading(true);

    const [sessionsRes, enrollmentsRes, attendanceRes] = await Promise.all([
      supabase
        .from("swim_sessions")
        .select("id, start_time, end_time, swim_level, age_group")
        .eq("is_active", true)
        .eq("day_of_week", dayName),
      supabase
        .from("swim_enrollments")
        .select("id, child_name, child_age, parent_name, session_id, status")
        .in("status", ["pending", "confirmed"]),
      supabase
        .from("attendance")
        .select("enrollment_id, checked_in")
        .eq("lesson_date", dateStr),
    ]);

    const sessions = sessionsRes.data || [];
    const enrollments = enrollmentsRes.data || [];
    const attendanceMap = new Map(
      (attendanceRes.data || []).map((a: any) => [a.enrollment_id, a.checked_in])
    );

    const groups: SessionGroup[] = sessions
      .map((session) => ({
        session,
        enrollments: enrollments
          .filter((e) => e.session_id === session.id)
          .map((e) => ({
            ...e,
            checked_in: attendanceMap.get(e.id) || false,
          })),
      }))
      .filter((g) => g.enrollments.length > 0)
      .sort((a, b) => a.session.start_time.localeCompare(b.session.start_time));

    setSessionGroups(groups);
    setLoading(false);
  };

  useEffect(() => {
    if (authenticated) fetchData();
  }, [authenticated]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === KIOSK_PIN) {
      setAuthenticated(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPin("");
    }
  };

  const handleCheckIn = async (enrollmentId: string, sessionId: string) => {
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

  // PIN screen
  if (!authenticated) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <Lock className="w-7 h-7 text-primary" />
            </div>
            <CardTitle className="text-xl">Swim Check-In</CardTitle>
            <p className="text-sm text-muted-foreground">Enter PIN to continue</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter PIN"
                className="text-center text-2xl tracking-[0.5em] h-14"
                autoFocus
              />
              {pinError && (
                <p className="text-sm text-destructive text-center">Incorrect PIN</p>
              )}
              <Button type="submit" className="w-full h-12 text-lg">
                Enter
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Session list
  if (!selectedSession) {
    return (
      <main className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <Waves className="w-10 h-10 text-primary mx-auto mb-2" />
            <h1 className="text-2xl font-display font-bold text-foreground">
              Today's Lessons
            </h1>
            <p className="text-muted-foreground">
              {format(today, "EEEE, MMMM d, yyyy")}
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : sessionGroups.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <p className="text-muted-foreground">No lessons scheduled today</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sessionGroups.map((group) => {
                const levelInfo = LEVEL_DISPLAY[group.session.swim_level as SwimLevel];
                const checkedCount = group.enrollments.filter((e) => e.checked_in).length;
                return (
                  <Card
                    key={group.session.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedSession(group.session.id)}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-lg">
                            {format(new Date(`2000-01-01T${group.session.start_time}`), "h:mm a")}
                          </span>
                          <Badge variant="outline" className={levelInfo?.color || ""}>
                            {levelInfo?.name || group.session.swim_level}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {group.enrollments.length} swimmer{group.enrollments.length !== 1 ? "s" : ""}
                          {checkedCount > 0 && ` · ${checkedCount} checked in`}
                        </p>
                      </div>
                      <div className="text-right">
                        {checkedCount === group.enrollments.length ? (
                          <CheckCircle2 className="w-6 h-6 text-green-500" />
                        ) : (
                          <span className="text-2xl font-bold text-muted-foreground">
                            {checkedCount}/{group.enrollments.length}
                          </span>
                        )}
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
  }

  // Student check-in for selected session
  const group = sessionGroups.find((g) => g.session.id === selectedSession);
  if (!group) return null;

  const levelInfo = LEVEL_DISPLAY[group.session.swim_level as SwimLevel];

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => setSelectedSession(null)}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to sessions
        </Button>

        <div className="text-center mb-6">
          <Badge variant="outline" className={`text-base px-4 py-1 ${levelInfo?.color || ""}`}>
            {levelInfo?.name || group.session.swim_level}
          </Badge>
          <h2 className="text-xl font-bold mt-2">
            {format(new Date(`2000-01-01T${group.session.start_time}`), "h:mm a")} Lesson
          </h2>
          <p className="text-sm text-muted-foreground">Tap your child's name to check in</p>
        </div>

        <div className="space-y-3">
          {group.enrollments.map((enr) => (
            <Card
              key={enr.id}
              className={`cursor-pointer transition-all ${
                enr.checked_in
                  ? "bg-green-50 border-green-200"
                  : "hover:shadow-md"
              }`}
              onClick={() => {
                if (!enr.checked_in) handleCheckIn(enr.id, group.session.id);
              }}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-lg">{enr.child_name}</p>
                  <p className="text-sm text-muted-foreground">
                    Age {enr.child_age} · Parent: {enr.parent_name}
                  </p>
                </div>
                {enr.checked_in ? (
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                ) : (
                  <Checkbox className="w-6 h-6" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
};

export default KioskCheckIn;
