import { useEffect, useMemo, useState } from "react";
import { format, startOfWeek, addDays, addWeeks, subWeeks, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

interface Shift {
  id: string;
  instructor_id: string | null;
  position_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  color: string | null;
  status: string;
}
interface Position { id: string; name: string; color: string; }
interface SwimSession {
  id: string;
  swim_level: string;
  age_group: string | null;
  start_time: string;
  end_time: string;
  day_of_week: string;
  session_name: string | null;
  instructor_id: string | null;
}
interface LessonDate { id: string; session_id: string; lesson_date: string; is_cancelled: boolean; }

const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${m.toString().padStart(2, "0")} ${period}`;
};

export default function InstructorMySchedule() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [sessions, setSessions] = useState<SwimSession[]>([]);
  const [lessonDates, setLessonDates] = useState<LessonDate[]>([]);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(addDays(weekStart, 6), "yyyy-MM-dd");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: instRow } = await supabase.rpc("current_user_instructor_id" as any);
      const id = (instRow as string) || null;
      setInstructorId(id);

      const [shiftsRes, posRes, sessRes, ldRes, pubRes] = await Promise.all([
        supabase.from("shifts").select("*")
          .gte("shift_date", weekStartStr).lte("shift_date", weekEndStr)
          .eq("instructor_id", id ?? "00000000-0000-0000-0000-000000000000"),
        supabase.from("shift_positions").select("id, name, color"),
        supabase.from("swim_sessions").select("id, swim_level, age_group, start_time, end_time, day_of_week, session_name, instructor_id")
          .eq("instructor_id", id ?? "00000000-0000-0000-0000-000000000000")
          .eq("is_active", true),
        supabase.from("session_lesson_dates").select("id, session_id, lesson_date, is_cancelled")
          .gte("lesson_date", weekStartStr).lte("lesson_date", weekEndStr),
        supabase.from("schedule_publications").select("week_start").eq("week_start", weekStartStr).maybeSingle(),
      ]);

      setShifts(shiftsRes.data ?? []);
      setPositions(posRes.data ?? []);
      setSessions(sessRes.data ?? []);
      setLessonDates(ldRes.data ?? []);
      setPublished(!!pubRes.data);
      setLoading(false);
    })();
  }, [weekStartStr, weekEndStr]);

  const positionById = (id: string | null) => positions.find((p) => p.id === id);

  // Combine shifts + class lessons into a per-day list
  const itemsForDay = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const dayShifts = shifts.filter((s) => s.shift_date === dateStr).map((s) => ({
      kind: "shift" as const,
      id: s.id,
      start: s.start_time,
      end: s.end_time,
      title: positionById(s.position_id)?.name || "Shift",
      color: s.color || positionById(s.position_id)?.color || "#2a5e84",
      notes: s.notes || "",
    }));

    const sessionIds = new Set(sessions.map((s) => s.id));
    const classLessons = lessonDates
      .filter((ld) => ld.lesson_date === dateStr && !ld.is_cancelled && sessionIds.has(ld.session_id))
      .flatMap((ld) => {
        const sess = sessions.find((s) => s.id === ld.session_id);
        if (!sess) return [];
        return [{
          kind: "class" as const,
          id: ld.id,
          start: sess.start_time,
          end: sess.end_time,
          title: sess.session_name || `${sess.swim_level}${sess.age_group ? " · " + sess.age_group : ""}`,
          color: "#0ea5e9",
          notes: "",
        }];
      });

    return [...dayShifts, ...classLessons].sort((a, b) => a.start.localeCompare(b.start));
  };

  const totalHours = (() => {
    let mins = 0;
    for (const s of shifts) {
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      mins += (eh * 60 + em) - (sh * 60 + sm);
    }
    return (mins / 60).toFixed(1);
  })();

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!instructorId) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Your account isn’t linked to an instructor record yet. Please ask an admin to link it.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">My Schedule</h2>
          <p className="text-sm text-muted-foreground">
            Week of {format(weekStart, "MMM d, yyyy")} · {totalHours} hrs
            {!published && <Badge variant="secondary" className="ml-2">Draft</Badge>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {days.map((d) => {
          const items = itemsForDay(d);
          return (
            <Card key={d.toISOString()} className="p-3">
              <div className="text-sm font-medium">{format(d, "EEE, MMM d")}</div>
              <div className="mt-2 space-y-2">
                {items.length === 0 && (
                  <p className="text-xs text-muted-foreground">Off</p>
                )}
                {items.map((it) => (
                  <div
                    key={`${it.kind}-${it.id}`}
                    className="rounded px-2 py-1.5 text-xs text-white"
                    style={{ backgroundColor: it.color }}
                  >
                    <div className="font-semibold">
                      {fmtTime(it.start)} – {fmtTime(it.end)}
                    </div>
                    <div className="opacity-90">
                      {it.title}
                      {it.kind === "class" && <Badge variant="outline" className="ml-1 text-[10px] bg-white/20 border-white/30 text-white">Class</Badge>}
                    </div>
                    {it.notes && <div className="opacity-90 mt-0.5">{it.notes}</div>}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
