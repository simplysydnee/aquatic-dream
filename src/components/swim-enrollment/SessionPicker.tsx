import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Clock, Users, Loader2, DollarSign, Calendar, ShoppingBag, CheckCircle2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SwimLevel, LEVEL_DISPLAY, getAgeGroup, getGroupName, AGE_GROUP_LABELS, PRICING } from "./types";
import LevelFullScreen from "./LevelFullScreen";

interface SlotInfo {
  assignSessionId: string;
  periodName: string;
  start_time: string;
  end_time: string;
  day_of_week: string;
  max_students: number;
  total_enrolled: number;
  spots_left: number;
  session_start_date: string;
  session_end_date: string;
  // Pricing
  full_price: number;
  price_per_lesson: number;
  total_lessons: number;
  remaining_lessons: number;
  prorated_price: number;
  is_started: boolean;
  remaining_dates: string[];
}

interface Props {
  level: SwimLevel;
  childAge: number;
  excludePeriodIds?: string[];
  onSelect: (sessionIds: string[]) => void;
  onBack: () => void;
}

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
}

function formatClassDate(d: string) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function formatDayOfWeek(dow: string) {
  const map: Record<string, string> = {
    monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
    friday: "Fri", saturday: "Sat", sunday: "Sun",
  };
  const parts = dow.toLowerCase().split("_");
  return parts.map(p => map[p] || p).join(" & ");
}

// Today in Pacific time as YYYY-MM-DD (matches how lesson_date is compared elsewhere).
function todayPacificISO(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date()); // en-CA produces YYYY-MM-DD
}

const SessionPicker = ({ level, childAge, excludePeriodIds, onSelect, onBack }: Props) => {
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const ageGroup = getAgeGroup(childAge);
  const levelInfo = LEVEL_DISPLAY[level];

  useEffect(() => {
    async function fetchSessions() {
      setLoading(true);
      try {
        const today = todayPacificISO();
        console.log("SessionPicker query params", {
          childAge,
          ageGroup,
          swimLevel: level,
          excludePeriodIds: excludePeriodIds || [],
        });
        const [periodsRes, sessionsRes] = await Promise.all([
          (supabase as any).from("session_periods_public").select("*").eq("is_active", true).gte("end_date", today).order("start_date"),
          supabase.from("swim_sessions").select("id, swim_level, day_of_week, start_time, end_time, max_students, is_active, session_name, session_start_date, session_end_date, age_group, price_per_lesson, total_lessons, session_price, instructor_id, registration_status, session_period_id")
            .eq("age_group", ageGroup)
            .eq("swim_level", level)
            .eq("is_active", true)
            .eq("registration_status", "open"),
        ]);

        const periods = periodsRes.data || [];
        const sessions = sessionsRes.data || [];

        if (sessions.length === 0) {
          setSlots([]);
          setLoading(false);
          return;
        }

        const activePeriodIds = new Set(periods.map(p => p.id));
        const excludeSet = new Set(excludePeriodIds || []);
        const activeSessions = sessions.filter(s =>
          s.session_period_id
          && activePeriodIds.has(s.session_period_id)
          && !excludeSet.has(s.session_period_id)
        );

        if (activeSessions.length === 0) {
          setSlots([]);
          setLoading(false);
          return;
        }

        const allIds = activeSessions.map(s => s.id);

        // Fetch enrollment counts and all future (non-cancelled) lesson dates
        // for every visible session — needed to filter out fully-elapsed
        // sessions and prorate price for ones already in progress.
        const [enrollmentsRes, datesRes] = await Promise.all([
          supabase.rpc("get_session_enrollment_counts", { _session_ids: allIds } as any),
          supabase
            .from("session_lesson_dates")
            .select("session_id, lesson_date")
            .in("session_id", allIds)
            .eq("is_cancelled", false)
            .gte("lesson_date", today)
            .order("lesson_date"),
        ]);

        const countMap: Record<string, number> = {};
        (enrollmentsRes.data as any[] | null)?.forEach((e) => {
          if (e?.session_id) countMap[e.session_id] = e.enrolled_count || 0;
        });

        const remainingByIdMap: Record<string, string[]> = {};
        (datesRes.data || []).forEach((d: any) => {
          if (!remainingByIdMap[d.session_id]) remainingByIdMap[d.session_id] = [];
          remainingByIdMap[d.session_id].push(d.lesson_date);
        });

        const periodMap = Object.fromEntries(periods.map(p => [p.id, p]));

        const result: SlotInfo[] = activeSessions
          .map((s) => {
            const totalEnrolled = countMap[s.id] || 0;
            const period = periodMap[s.session_period_id!];
            const remainingDates = remainingByIdMap[s.id] || [];
            const remainingLessons = remainingDates.length;
            const totalLessons = Number(s.total_lessons) || 8;
            const perLessonRate = Number(s.price_per_lesson) || PRICING.group;
            const fullPrice = Number(s.session_price) || (totalLessons * perLessonRate);
            const isStarted = remainingLessons > 0 && remainingLessons < totalLessons;
            const proratedPrice = isStarted
              ? Math.min(remainingLessons * perLessonRate, fullPrice)
              : fullPrice;
            return {
              assignSessionId: s.id,
              periodName: period?.name || "Session",
              start_time: s.start_time,
              end_time: s.end_time,
              day_of_week: s.day_of_week,
              max_students: s.max_students,
              total_enrolled: totalEnrolled,
              spots_left: s.max_students - totalEnrolled,
              session_start_date: s.session_start_date || "",
              session_end_date: s.session_end_date || "",
              full_price: fullPrice,
              price_per_lesson: perLessonRate,
              total_lessons: totalLessons,
              remaining_lessons: remainingLessons,
              prorated_price: proratedPrice,
              is_started: isStarted,
              remaining_dates: remainingDates,
            };
          })
          // Hide sessions where every lesson has already passed.
          .filter((s) => s.remaining_lessons > 0);

        result.sort((a, b) => {
          if (a.periodName !== b.periodName) return a.periodName.localeCompare(b.periodName);
          return a.start_time.localeCompare(b.start_time);
        });

        setSlots(result);
      } catch (err) {
        console.error("Error fetching sessions:", err);
        setSlots([]);
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, [level, ageGroup, excludePeriodIds]);

  // Group by period
  const grouped = slots.reduce<Record<string, SlotInfo[]>>((acc, s) => {
    const key = `${s.periodName}|${s.session_start_date}|${s.session_end_date}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const slotMap = useMemo(
    () => Object.fromEntries(slots.map((s) => [s.assignSessionId, s])),
    [slots],
  );

  const levelFull = !loading && (slots.length === 0 || slots.every(s => s.spots_left <= 0));

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      className="max-w-2xl mx-auto"
    >
      {!levelFull && (
        <>
          <h3 className="font-display text-2xl font-bold text-foreground mb-1">
            Pick Your Sessions
          </h3>
          <p className="text-muted-foreground text-sm mb-2">
            Choose one or more <strong>{getGroupName(level, ageGroup)}</strong> ({levelInfo.name}) sessions · {AGE_GROUP_LABELS[ageGroup]}
          </p>
          {slots.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
              <span className="flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" />
                ${PRICING.group}/lesson (group)
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDayOfWeek(slots[0].day_of_week)}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm bg-accent/50 border border-accent rounded-lg p-3 mb-6">
            <ShoppingBag className="w-4 h-4 text-primary shrink-0" />
            <span className="text-foreground">
              <strong>${PRICING.registrationFee} registration fee</strong> — includes swim bag, swim cap & goggles
            </span>
          </div>
        </>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : slots.length === 0 || slots.every(s => s.spots_left <= 0) ? (
        <LevelFullScreen level={level} childAge={childAge} ageGroup={ageGroup} onBack={onBack} />
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([key, groupSlots]) => {
            const [name, startDate, endDate] = key.split("|");
            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="font-semibold text-foreground">{name}</h4>
                  {startDate && endDate && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {formatDateRange(startDate, endDate)}
                    </span>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {groupSlots.map((slot) => {
                    const isFull = slot.spots_left <= 0;
                    const isSelected = selectedIds.has(slot.assignSessionId);
                    return (
                      <button
                        key={slot.assignSessionId}
                        disabled={isFull}
                        onClick={() => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (next.has(slot.assignSessionId)) {
                              next.delete(slot.assignSessionId);
                            } else {
                              next.add(slot.assignSessionId);
                            }
                            return next;
                          });
                        }}
                        className={`text-left p-4 rounded-xl border transition-all ${
                          isFull
                            ? "opacity-50 cursor-not-allowed border-border bg-muted"
                            : isSelected
                            ? "border-primary bg-accent shadow-md"
                            : "border-border hover:border-primary/40 bg-card"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {isFull ? (
                                <span className="text-destructive font-medium">Full</span>
                              ) : (
                                <span>{slot.spots_left} spot{slot.spots_left !== 1 ? "s" : ""} left</span>
                              )}
                            </span>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                          {slot.is_started ? (
                            <>
                              <span className="font-semibold text-foreground">
                                ${slot.prorated_price}
                              </span>
                              <span className="text-xs text-muted-foreground line-through">
                                ${slot.full_price}
                              </span>
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                <Zap className="w-3 h-3" />
                                In progress — {slot.remaining_lessons} of {slot.total_lessons} classes left
                              </span>
                            </>
                          ) : (
                            <span className="font-semibold text-foreground">
                              ${slot.full_price}
                              <span className="text-xs text-muted-foreground font-normal"> · {slot.total_lessons} classes</span>
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="mt-4 space-y-3">
          {Array.from(selectedIds).map(id => {
            const slot = slotMap[id];
            const dates = slot?.remaining_dates || [];
            if (!slot || dates.length === 0) return null;
            return (
              <div key={id} className="p-4 rounded-xl border border-primary/20 bg-accent/30">
                <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-primary" />
                  {slot.periodName} — {dates.length} {slot.is_started ? "classes remaining" : "classes"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {dates.map(d => (
                    <span key={d} className="text-xs bg-background border border-border rounded-md px-2 py-1 text-muted-foreground">
                      {formatClassDate(d)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedIds.size > 1 && (
        <p className="mt-3 text-sm text-primary font-medium text-center">
          ✓ {selectedIds.size} sessions selected
        </p>
      )}

      {!levelFull && (
        <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 mt-8">
          <Button variant="ghost" onClick={onBack} className="w-full sm:w-auto">
            <ChevronLeft className="mr-1 w-4 h-4" /> Back
          </Button>
          <Button
            disabled={selectedIds.size === 0}
            onClick={() => onSelect(Array.from(selectedIds))}
            className="w-full sm:w-auto bg-primary text-primary-foreground"
          >
            Continue <ChevronRight className="ml-1 w-4 h-4" />
          </Button>
        </div>
      )}
    </motion.div>
  );
};

export default SessionPicker;
