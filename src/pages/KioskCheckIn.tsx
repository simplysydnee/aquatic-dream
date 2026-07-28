import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";
import { Waves, CheckCircle2, ShieldAlert } from "lucide-react";

type Phase = "now" | "upcoming" | "done";

interface RosterItem {
  // kind: 'group' uses enrollment_id, others use occurrence_id
  kind: "group" | "private" | "semi_private" | "membership";
  id: string; // enrollment_id or occurrence_id
  session_id: string | null; // group sessions only
  child_name: string;
  child_age: number | null;
  parent_name: string;
  has_waiver: boolean;
  checked_in: boolean;
  checked_in_at: string | null;
}

interface Slot {
  key: string;
  start_time: string;
  end_time: string;
  swim_level: string | null; // for group
  age_group: string | null;
  session_name: string | null;
  instructor_name: string | null;
  lesson_type: "group" | "private" | "semi_private" | "membership";
  items: RosterItem[];
}


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
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const today = new Date();
  const dateStr = format(today, "yyyy-MM-dd");

  const fetchData = async () => {
    const [sessionsRes, enrollmentsRes, attendanceRes, occRes, memOccRes, plansRes, instrRes] = await Promise.all([
      supabase
        .from("swim_sessions")
        .select("id, start_time, end_time, swim_level, age_group, session_name, instructor_id, session_start_date, session_end_date, instructors(name)")
        .eq("is_active", true)
        .in("day_of_week", daysForToday(today))
        .lte("session_start_date", dateStr)
        .gte("session_end_date", dateStr),
      supabase
        .from("swim_enrollments")
        .select("id, child_name, child_age, parent_name, session_id, status")
        .in("status", ["confirmed", "enrolled"]),
      supabase
        .from("attendance")
        .select("enrollment_id, checked_in, checked_in_at")
        .eq("lesson_date", dateStr),
      supabase
        .from("lesson_booking_occurrences")
        .select("id, occurrence_date, status, checked_in_at, lesson_bookings!inner(id, lesson_type, instructor_name, parent_name, child_name, child_age, start_time, end_time, status)")
        .eq("occurrence_date", dateStr)
        .not("status", "in", "(cancelled,abandoned)") as any,
      (supabase
        .from("membership_occurrences") as any)
        .select("id, occurrence_date, start_time, end_time, instructor_id, status, checked_in_at, checked_in_by, memberships!inner(id, plan_key, child_first_name, child_last_name, parent_first_name, parent_last_name, waiver_id, standing_slots(id, start_time, end_time, instructor_id))")
        .eq("occurrence_date", dateStr)
        .eq("status", "scheduled"),
      supabase.from("membership_plans").select("plan_key, name"),
      supabase.from("instructors").select("id, name"),
    ]);


    const sessions = (sessionsRes.data || []) as any[];
    const enrollments = (enrollmentsRes.data || []) as any[];
    const attMap = new Map(
      (attendanceRes.data || []).map((a: any) => [a.enrollment_id, a])
    );

    // Universal waiver lookup for all enrollments shown
    const enrIds = enrollments.map((e) => e.id);
    const waiverByEnr = new Map<string, boolean>();
    if (enrIds.length) {
      const { data: w } = await (supabase.rpc as any)("enrollments_waiver_status", { _ids: enrIds });
      ((w as any[]) || []).forEach((r) => waiverByEnr.set(r.enrollment_id, !!r.has_waiver));
    }

    // Private lessons today
    const occurrences = (((occRes as any).data) || []).filter(
      (o: any) => o.lesson_bookings?.status === "active"
    );
    const bookingIds = Array.from(
      new Set(occurrences.map((o: any) => o.lesson_bookings?.id).filter(Boolean))
    ) as string[];
    const waiverByBooking = new Map<string, boolean>();
    if (bookingIds.length) {
      const { data: w } = await (supabase.rpc as any)("bookings_waiver_status", { _ids: bookingIds });
      ((w as any[]) || []).forEach((r) => waiverByBooking.set(r.booking_id, !!r.has_waiver));
    }

    // Build group slots
    const groupSlots: Slot[] = sessions.map((s) => {
      const seen = new Set<string>();
      const items: RosterItem[] = [];
      for (const e of enrollments.filter((x) => x.session_id === s.id)) {
        const dedupeKey = `${e.id}|${(e.child_name || "").trim().toLowerCase()}`;
        const nameKey = `name:${(e.child_name || "").trim().toLowerCase()}`;
        if (seen.has(dedupeKey) || seen.has(nameKey)) continue;
        seen.add(dedupeKey);
        seen.add(nameKey);
        const a = attMap.get(e.id) as any;
        items.push({
          kind: "group",
          id: e.id,
          session_id: s.id,
          child_name: e.child_name,
          child_age: e.child_age ?? null,
          parent_name: e.parent_name,
          has_waiver: waiverByEnr.get(e.id) ?? false,
          checked_in: !!a?.checked_in,
          checked_in_at: a?.checked_in_at ?? null,
        });
      }
      return {
        key: `g:${s.id}`,
        start_time: s.start_time,
        end_time: s.end_time,
        swim_level: s.swim_level,
        age_group: s.age_group,
        session_name: s.session_name,
        instructor_name: s.instructors?.name ?? null,
        lesson_type: "group" as const,
        items,
      };
    }).filter((g) => g.items.length > 0);

    // Build private/semi-private slots (one card per occurrence)
    const privateSlots: Slot[] = occurrences.map((o: any) => {
      const b = o.lesson_bookings;
      const item: RosterItem = {
        kind: (b.lesson_type === "semi_private" ? "semi_private" : "private"),
        id: o.id,
        session_id: null,
        child_name: b.child_name || "(no name)",
        child_age: b.child_age ?? null,
        parent_name: b.parent_name || "",
        has_waiver: waiverByBooking.get(b.id) ?? false,
        checked_in: !!o.checked_in_at,
        checked_in_at: o.checked_in_at ?? null,
      };
      return {
        key: `p:${o.id}`,
        start_time: (b.start_time || "").slice(0, 8),
        end_time: (b.end_time || "").slice(0, 8),
        swim_level: null,
        age_group: null,
        session_name: b.lesson_type === "semi_private" ? "Semi-Private" : "Private",
        instructor_name: b.instructor_name || null,
        lesson_type: (b.lesson_type === "semi_private" ? "semi_private" : "private") as any,
        items: [item],
      };
    });

    setSlots([...groupSlots, ...privateSlots]);
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

  const ordered = useMemo(() => {
    const now = new Date();
    const rank: Record<Phase, number> = { now: 0, upcoming: 1, done: 2 };
    return [...slots]
      .map((g) => ({ ...g, phase: phaseFor(g.start_time, g.end_time, now) }))
      .sort((a, b) => {
        if (rank[a.phase] !== rank[b.phase]) return rank[a.phase] - rank[b.phase];
        if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
        const ia = (a.instructor_name || "zzz").toLowerCase();
        const ib = (b.instructor_name || "zzz").toLowerCase();
        if (ia !== ib) return ia.localeCompare(ib);
        return (a.swim_level || a.session_name || "").localeCompare(b.swim_level || b.session_name || "");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, tick]);

  const handleCheckIn = async (slot: Slot, item: RosterItem) => {
    // optimistic
    setSlots((prev) =>
      prev.map((g) =>
        g.key !== slot.key
          ? g
          : {
              ...g,
              items: g.items.map((i) =>
                i.id === item.id
                  ? { ...i, checked_in: true, checked_in_at: new Date().toISOString() }
                  : i
              ),
            }
      )
    );

    if (item.kind === "group" && item.session_id) {
      await supabase.from("attendance").upsert(
        {
          enrollment_id: item.id,
          session_id: item.session_id,
          lesson_date: dateStr,
          checked_in: true,
          checked_in_at: new Date().toISOString(),
          checked_in_by: "kiosk",
        },
        { onConflict: "enrollment_id,lesson_date" }
      );
    } else {
      await (supabase
        .from("lesson_booking_occurrences") as any)
        .update({ checked_in_at: new Date().toISOString(), checked_in_by: "kiosk" })
        .eq("id", item.id);
    }
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
        ) : ordered.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground">No lessons scheduled today</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {ordered.map((group) => {
              const levelInfo = group.swim_level
                ? LEVEL_DISPLAY[group.swim_level as SwimLevel]
                : null;
              const isDone = group.phase === "done";
              const isNow = group.phase === "now";
              const isPrivate = group.lesson_type !== "group";
              return (
                <Card
                  key={group.key}
                  className={`transition-all ${
                    isNow ? "border-primary border-2 shadow-md" : ""
                  } ${isDone ? "opacity-50" : ""}`}
                >
                  <CardContent className="p-4 md:p-5">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-3 pb-3 border-b">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-bold text-xl">
                          {format(
                            new Date(`2000-01-01T${group.start_time}`),
                            "h:mm a"
                          )}
                        </span>
                        {isPrivate ? (
                          <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">
                            {group.lesson_type === "semi_private" ? "Semi-Private" : "Private"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className={levelInfo?.color || ""}>
                            {levelInfo?.name || group.swim_level}
                          </Badge>
                        )}
                        {group.instructor_name && (
                          <span className="text-sm text-muted-foreground">
                            w/ {group.instructor_name}
                          </span>
                        )}
                        {isNow && (
                          <Badge className="bg-primary text-primary-foreground">Now</Badge>
                        )}
                        {isDone && <Badge variant="secondary">Finished</Badge>}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {group.items.filter((e) => e.checked_in).length}/
                        {group.items.length} checked in
                      </span>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-2">
                      {group.items.map((enr) => (
                        <button
                          key={enr.id}
                          disabled={enr.checked_in || isDone}
                          onClick={() => handleCheckIn(group, enr)}
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
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-semibold text-lg truncate">
                                  {enr.child_name}
                                </p>
                                {!enr.has_waiver && (
                                  <Badge variant="destructive" className="gap-1 text-[10px] py-0 h-5">
                                    <ShieldAlert className="w-3 h-3" /> Waiver
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {enr.checked_in && enr.checked_in_at
                                  ? `Checked in ${format(
                                      new Date(enr.checked_in_at),
                                      "h:mm a"
                                    )}`
                                  : `${enr.child_age ? `Age ${enr.child_age} · ` : ""}${enr.parent_name}`}
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
