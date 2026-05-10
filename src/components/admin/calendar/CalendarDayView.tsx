import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";
import type {
  CalendarSwimSession,
  CalendarEnrollment,
  CalendarPoolEvent,
  AttendanceRecord,
  EnrollmentAgreement,
  LessonDate,
} from "@/hooks/useCalendarData";
import { Lock, Plus, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import CalendarBlockDetail from "./CalendarBlockDetail";
import type { BlockInfo } from "./CalendarBlockDetail";
import type { ActivityType } from "./CalendarFilterBar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import InstructorDayModal from "./InstructorDayModal";
import { UserCircle2 } from "lucide-react";

/* ── ICS session from Airtable edge function ── */
export interface ICSSession {
  id: string;
  start_time: string; // UTC ISO
  end_time: string;
  location: string;
  session_type: string;
  status: string;
  max_capacity: number;
  instructor_name: string | null;
  confirmed_bookings: number;
  client_name?: string | null;
  parent_name?: string | null;
  parent_email?: string | null;
  parent_phone?: string | null;
}

/* ── Layout constants ── */
const HOUR_HEIGHT = 80; // px per hour
const START_HOUR = 7;
const END_HOUR = 20;
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

/* ── Color configs ── */
const BLOCK_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "i-can-swim":         { bg: "#d4f0f8", border: "#2a5e84", text: "#2a5e84" },
  "i-can-swim-closed":  { bg: "#2c2c2c", border: "#111",    text: "#e0e0e0" },
  "swim":               { bg: "#d0ddf7", border: "#1a3a8a", text: "#1a3a8a" },
  "swim-lesson":        { bg: "#e8f5e9", border: "#2e7d32", text: "#2e7d32" },
  "private-lesson":     { bg: "#EEEDFE", border: "#26215C", text: "#26215C" },
  "semi-private-lesson":{ bg: "#FBEAF0", border: "#4B1528", text: "#4B1528" },
  "dive-session":       { bg: "#FAEEDA", border: "#633806", text: "#633806" },
  "pool-rental":        { bg: "#F1EFE8", border: "#2C2C2A", text: "#2C2C2A" },
  "maintenance":        { bg: "#F3F3F3", border: "#666",    text: "#333" },
  "other":              { bg: "#F3F3F3", border: "#666",    text: "#333" },
};

/* ── Swim level colors (Starfish palette) ── */
const LEVEL_COLORS: Record<string, { bg: string; border: string; text: string; headerBg: string }> = {
  white:  { bg: "#f5f5f0", border: "#b0a890", text: "#5a5240", headerBg: "#eae8e0" },
  red:    { bg: "#fde8e8", border: "#c53030", text: "#9b2c2c", headerBg: "#fed7d7" },
  yellow: { bg: "#fefcbf", border: "#d69e2e", text: "#975a16", headerBg: "#fef9c3" },
  blue:   { bg: "#dbeafe", border: "#2563eb", text: "#1e40af", headerBg: "#bfdbfe" },
  green:  { bg: "#dcfce7", border: "#16a34a", text: "#166534", headerBg: "#bbf7d0" },
};

/* ── Helpers ── */
function timeToMinutes(t: string): number {
  // handles "HH:MM", "HH:MM:SS", and ISO strings
  if (t.includes("T")) {
    const d = new Date(t);
    const la = new Date(d.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    return la.getHours() * 60 + la.getMinutes();
  }
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTop(mins: number): number {
  return ((mins - START_HOUR * 60) / 60) * HOUR_HEIGHT;
}

function durationHeight(startMins: number, endMins: number): number {
  return Math.max(((endMins - startMins) / 60) * HOUR_HEIGHT, 24);
}

function fmtTime(t: string): string {
  if (t.includes("T")) {
    const d = new Date(t);
    return d.toLocaleTimeString("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  return format(new Date(`2000-01-01T${t}`), "h:mm a");
}

/* ── Props ── */
interface Props {
  date: Date;
  swimSessions: CalendarSwimSession[];
  enrollments: CalendarEnrollment[];
  poolEvents: CalendarPoolEvent[];
  attendance: AttendanceRecord[];
  agreements: EnrollmentAgreement[];
  icsSessions: ICSSession[];
  lessonDates: LessonDate[];
  activeFilters: Set<ActivityType>;
  onAttendanceChange: () => void;
  onEditEvent?: (event: CalendarPoolEvent) => void;
  onDeleteEvent?: (eventId: string) => void;
  onAddEvent?: (prefill: { startTime: string; eventType?: string }) => void;
}

/* ── Column types ── */
interface ColumnDef {
  id: string;
  label: string;
  group: "ics" | "ad" | "dive";
  sessionName?: string;
  swimLevel?: string;
}

const CalendarDayView = ({
  date,
  swimSessions,
  enrollments,
  poolEvents,
  attendance,
  agreements,
  icsSessions,
  lessonDates,
  activeFilters,
  onAttendanceChange,
  onEditEvent,
  onDeleteEvent,
  onAddEvent,
}: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailBlock, setDetailBlock] = useState<BlockInfo | null>(null);
  const [hoverSlot, setHoverSlot] = useState<{ colId: string; y: number } | null>(null);
  const [now, setNow] = useState(new Date());
  const [openInstructor, setOpenInstructor] = useState<string | null>(null);
  const { toast } = useToast();

  // Update current time every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to 1 hour before current time on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const pacificNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const currentHour = pacificNow.getHours();
    const scrollToHour = Math.max(START_HOUR, currentHour - 1);
    const scrollTop = (scrollToHour - START_HOUR) * HOUR_HEIGHT;
    scrollRef.current.scrollTop = scrollTop;
  }, [date]);

  const dateStr = format(date, "yyyy-MM-dd");
  const dayName = format(date, "EEEE");

  // ── I Can Swim columns (dynamic from Airtable) ──
  const todayICS = useMemo(() => {
    const selectedDateStr = format(date, "yyyy-MM-dd");
    return icsSessions.filter((s) => {
      const d = new Date(s.start_time);
      // Convert to Pacific time and format as yyyy-MM-dd for reliable comparison
      const pacificDate = d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }); // en-CA = yyyy-MM-dd
      return pacificDate === selectedDateStr;
    });
  }, [icsSessions, date]);

  const icsInstructors = useMemo(() => {
    const names = [...new Set(todayICS.map((s) => s.instructor_name).filter(Boolean))] as string[];
    return names.length > 0 ? names.slice(0, 5) : ["Instructor"];
  }, [todayICS]);

  // ── Aquatic Dreams sessions actually happening today ──
  // A class "happens today" only if there's a non-cancelled session_lesson_dates row
  // for the selected date. This filters out recurring templates outside their session period.
  const activeSessionIdsToday = useMemo(() => {
    return new Set(
      lessonDates
        .filter((ld) => ld.lesson_date === dateStr && !ld.is_cancelled)
        .map((ld) => ld.session_id)
    );
  }, [lessonDates, dateStr]);

  const todaySessions = useMemo(
    () => swimSessions.filter(
      (s) =>
        s.day_of_week.toLowerCase().includes(dayName.toLowerCase()) &&
        activeSessionIdsToday.has(s.id)
    ),
    [swimSessions, dayName, activeSessionIdsToday]
  );

  // Count confirmed swimmers across today's classes
  const todaySwimmerCount = useMemo(() => {
    const ids = new Set(todaySessions.map((s) => s.id));
    return enrollments.filter(
      (e) => e.session_id && ids.has(e.session_id) && e.status === "confirmed"
    ).length;
  }, [enrollments, todaySessions]);

  // ── Pool events for today (non-ICS) ──
  const todayEvents = useMemo(
    () => poolEvents.filter((e) => e.event_date === dateStr),
    [poolEvents, dateStr]
  );

  const adEventsAll = todayEvents.filter(
    (e) => !["dive-session", "pool-rental", "i-can-swim", "maintenance", "swim-lesson"].includes(e.event_type)
  );
  const lessonEvents = adEventsAll.filter(
    (e) => e.event_type === "private-lesson" || e.event_type === "semi-private-lesson"
  );
  const walkInEvents = adEventsAll.filter(
    (e) => e.event_type !== "private-lesson" && e.event_type !== "semi-private-lesson"
  );
  // Keep adEvents for column rendering (all of them render in the AD column)
  const adEvents = adEventsAll;
  const swimLessonEvents = todayEvents.filter((e) => e.event_type === "swim-lesson");
  const diveRentalEvents = todayEvents.filter(
    (e) => ["dive-session", "pool-rental", "maintenance"].includes(e.event_type)
  );

  // ── Determine which groups are visible based on filters ──
  const showICS = activeFilters.has("i-can-swim");
  const showAD = activeFilters.has("swim") || activeFilters.has("private-lesson") || activeFilters.has("semi-private-lesson");
  const showDive = activeFilters.has("dive-session") || activeFilters.has("pool-rental");

  // ── Build unique AD session-name columns from today's sessions ──
  const adSessionColumns = useMemo(() => {
    const seen = new Map<string, { sessionName: string; swimLevel: string }>();
    // Sort by curriculum order: white, red, yellow, blue, green
    const levelOrder = ["white", "red", "yellow", "blue", "green"];
    const sorted = [...todaySessions].sort((a, b) => {
      const ai = levelOrder.indexOf(a.swim_level);
      const bi = levelOrder.indexOf(b.swim_level);
      return ai - bi;
    });
    for (const s of sorted) {
      const name = s.session_name || s.swim_level;
      if (!seen.has(name)) {
        seen.set(name, { sessionName: name, swimLevel: s.swim_level });
      }
    }
    return [...seen.values()];
  }, [todaySessions]);

  // ── Build columns ──
  const columns = useMemo<ColumnDef[]>(() => {
    const cols: ColumnDef[] = [];
    if (showICS) {
      icsInstructors.forEach((name, i) => {
        cols.push({ id: `ics-${i}`, label: name, group: "ics" });
      });
    }
    if (showAD) {
      if (adSessionColumns.length > 0) {
        adSessionColumns.forEach((col, i) => {
          cols.push({
            id: `ad-${i}`,
            label: col.sessionName,
            group: "ad",
            sessionName: col.sessionName,
            swimLevel: col.swimLevel,
          });
        });
      } else {
        // Fallback if no swim sessions today but there are ad events
        if (adEvents.length > 0) {
          cols.push({ id: "ad-0", label: "Lessons", group: "ad" });
        }
      }
    }
    if (showDive) {
      cols.push({ id: "dive", label: "Dive / Rental", group: "dive" });
    }
    return cols;
  }, [icsInstructors, showICS, showAD, showDive, adSessionColumns, adEvents.length]);

  const icsCount = columns.filter((c) => c.group === "ics").length;
  const adCount = columns.filter((c) => c.group === "ad").length;
  const diveCount = columns.filter((c) => c.group === "dive").length;

  // ── Delete handler ──
  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("pool_events").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event deleted" });
      onDeleteEvent?.(deleteId);
    }
    setDeleteId(null);
  };

  // ── Check-in handler ──
  const handleCheckIn = async (enrollmentId: string, sessionId: string, currentlyCheckedIn: boolean) => {
    if (currentlyCheckedIn) {
      await supabase.from("attendance").delete().eq("enrollment_id", enrollmentId).eq("lesson_date", dateStr);
    } else {
      await supabase.from("attendance").upsert(
        {
          enrollment_id: enrollmentId,
          session_id: sessionId,
          lesson_date: dateStr,
          checked_in: true,
          checked_in_at: new Date().toISOString(),
          checked_in_by: "admin",
        },
        { onConflict: "enrollment_id,lesson_date" }
      );
    }
    onAttendanceChange();
  };

  // ── Empty slot click ──
  const handleEmptySlotClick = (colId: string, yPos: number) => {
    const mins = Math.floor(yPos / HOUR_HEIGHT * 60) + START_HOUR * 60;
    const roundedMins = Math.round(mins / 15) * 15;
    const h = Math.floor(roundedMins / 60).toString().padStart(2, "0");
    const m = (roundedMins % 60).toString().padStart(2, "0");
    onAddEvent?.({ startTime: `${h}:${m}` });
  };

  // ── Render a positioned block ──
  const renderBlock = (
    key: string,
    startMins: number,
    endMins: number,
    colorKey: string,
    label: string,
    subtitle: string,
    dimmed: boolean,
    onClick?: () => void,
    isICS?: boolean,
    actions?: React.ReactNode,
    tooltip?: React.ReactNode
  ) => {
    const top = minutesToTop(startMins);
    const height = durationHeight(startMins, endMins);
    const colors = BLOCK_COLORS[colorKey] || BLOCK_COLORS.other;

    const blockEl = (
      <div
        key={key}
        className={cn(
          "absolute left-1 right-1 rounded-md border-l-[3px] px-2 py-1 overflow-hidden transition-opacity cursor-pointer hover:shadow-md z-10",
          dimmed && "opacity-[0.12]"
        )}
        style={{
          top: `${top}px`,
          height: `${height}px`,
          backgroundColor: colors.bg,
          borderLeftColor: colors.border,
          color: colors.text,
        }}
        onMouseMove={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate leading-tight">{label}</p>
            {height > 32 && (
              <p className="text-[10px] truncate opacity-80 leading-tight mt-0.5">{subtitle}</p>
            )}
          </div>
          {isICS && <Lock className="w-3 h-3 shrink-0 opacity-40 mt-0.5" />}
          {actions}
        </div>
      </div>
    );

    if (!tooltip) return blockEl;
    return (
      <Tooltip key={key} delayDuration={150}>
        <TooltipTrigger asChild>{blockEl}</TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* ── Group headers ── */}
      <div className="flex border-b">
        {/* Time gutter */}
        <div className="w-16 shrink-0" />
        {/* ICS group */}
        {icsCount > 0 && (
          <div
            className="text-center text-xs font-semibold py-1.5 border-l"
            style={{
              backgroundColor: "#d4f0f8",
              color: "#2a5e84",
              flex: icsCount,
            }}
          >
            I Can Swim 209 — {todayICS.length > 0 ? icsInstructors.length : 0} instructor{icsInstructors.length !== 1 ? "s" : ""} today
          </div>
        )}
        {/* AD group */}
        {adCount > 0 && (
          <div
            className="flex items-center justify-center gap-2 text-xs font-semibold py-1.5 border-l px-2"
            style={{ backgroundColor: "#d0ddf7", color: "#1a3a8a", flex: adCount }}
          >
            <span>Aquatic Dreams</span>
            {todaySessions.length === 0 && adEvents.length === 0 ? (
              <span className="font-normal opacity-70">— No groups today</span>
            ) : (
              <span className="flex items-center gap-1.5 font-normal flex-wrap">
                {todaySessions.length > 0 && (
                  <span title="Classes scheduled today" className="px-1.5 py-0.5 rounded bg-white/60">
                    {todaySessions.length} {todaySessions.length === 1 ? "class" : "classes"}
                  </span>
                )}
                {todaySwimmerCount > 0 && (
                  <span title="Confirmed enrollments across today's classes" className="px-1.5 py-0.5 rounded bg-white/60">
                    {todaySwimmerCount} {todaySwimmerCount === 1 ? "swimmer" : "swimmers"}
                  </span>
                )}
                {lessonEvents.length > 0 && (
                  <span title="Private and semi-private lessons" className="px-1.5 py-0.5 rounded bg-white/60">
                    {lessonEvents.length} {lessonEvents.length === 1 ? "lesson" : "lessons"}
                  </span>
                )}
                {walkInEvents.length > 0 && (
                  <span title="Walk-ins and other events" className="px-1.5 py-0.5 rounded bg-white/60">
                    {walkInEvents.length} {walkInEvents.length === 1 ? "event" : "events"}
                  </span>
                )}
              </span>
            )}
          </div>
        )}
        {/* Dive group */}
        {diveCount > 0 && (
          <div
            className="text-center text-xs font-semibold py-1.5 border-l"
            style={{ backgroundColor: "#FAEEDA", color: "#633806", flex: diveCount }}
          >
            Dive / Rental
          </div>
        )}
      </div>

      {/* ── Instructors today (clickable to open day-modal) ── */}
      {(() => {
        const names = new Set<string>();
        todaySessions.forEach((s) => s.instructors?.name && names.add(s.instructors.name));
        adEvents.forEach((e) => e.instructor_name && names.add(e.instructor_name));
        swimLessonEvents.forEach((e) => e.instructor_name && names.add(e.instructor_name));
        const list = [...names].sort();
        if (list.length === 0) return null;
        return (
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b bg-muted/20">
            <span className="text-[11px] font-medium text-muted-foreground mr-1">Instructors today:</span>
            {list.map((n) => (
              <button
                key={n}
                onClick={() => setOpenInstructor(n)}
                className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs hover:bg-accent hover:border-primary/50 transition-colors"
              >
                <UserCircle2 className="w-3 h-3" />
                {n}
              </button>
            ))}
          </div>
        );
      })()}

      {/* ── Column name headers (color-coded for AD) ── */}
      <div className="flex border-b">
        <div className="w-16 shrink-0" />
        {columns.map((col) => {
          const levelColor = col.swimLevel ? LEVEL_COLORS[col.swimLevel] : null;
          return (
            <div
              key={col.id}
              className="flex-1 text-center text-[11px] font-semibold py-1.5 border-l truncate px-1"
              style={levelColor ? {
                backgroundColor: levelColor.headerBg,
                color: levelColor.text,
                borderBottom: `2px solid ${levelColor.border}`,
              } : undefined}
            >
              {col.label}
            </div>
          );
        })}
      </div>

      {/* ── Time grid (scrollable) ── */}
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
      <div className="flex overflow-x-auto relative">
        {/* ── Current time indicator ── */}
        {(() => {
          const isToday = format(date, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");
          if (!isToday) return null;
          const pacificNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
          const nowMins = pacificNow.getHours() * 60 + pacificNow.getMinutes();
          if (nowMins < START_HOUR * 60 || nowMins > END_HOUR * 60) return null;
          const top = minutesToTop(nowMins);
          return (
            <div
              className="absolute left-0 right-0 z-30 pointer-events-none"
              style={{ top: `${top}px` }}
            >
              <div className="flex items-center">
                <div className="w-16 shrink-0 flex justify-end pr-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                </div>
                <div className="flex-1 h-[2px] bg-red-500" />
              </div>
            </div>
          );
        })()}
        {/* Time labels */}
        <div className="w-16 shrink-0 relative" style={{ height: `${TOTAL_HEIGHT}px` }}>
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute right-2 text-[11px] text-muted-foreground font-medium"
              style={{ top: `${(h - START_HOUR) * HOUR_HEIGHT - 7}px` }}
            >
              {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
            </div>
          ))}
        </div>

        {/* Columns */}
        {columns.map((col, colIdx) => (
          <div
            key={col.id}
            className="flex-1 relative border-l"
            style={{ height: `${TOTAL_HEIGHT}px`, minWidth: "120px" }}
            onMouseMove={(e) => {
              if (col.group !== "ics") {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoverSlot({ colId: col.id, y: e.clientY - rect.top });
              }
            }}
            onMouseLeave={() => setHoverSlot(null)}
            onClick={(e) => {
              if (col.group !== "ics") {
                const rect = e.currentTarget.getBoundingClientRect();
                handleEmptySlotClick(col.id, e.clientY - rect.top);
              }
            }}
          >
            {/* Hour lines */}
            {HOURS.map((h) => (
              <div key={h}>
                <div
                  className="absolute left-0 right-0 border-t border-border/60"
                  style={{ top: `${(h - START_HOUR) * HOUR_HEIGHT}px` }}
                />
                {h < END_HOUR && (
                  <div
                    className="absolute left-0 right-0 border-t border-dashed border-border/30"
                    style={{ top: `${(h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }}
                  />
                )}
              </div>
            ))}

            {/* ── ICS blocks ── */}
            {col.group === "ics" &&
              todayICS
                .filter((s) => (s.instructor_name || "Instructor") === col.label)
                .map((s) => {
                  const startMins = timeToMinutes(s.start_time);
                  const endMins = timeToMinutes(s.end_time);
                  const isClosed = s.status?.toLowerCase() === "closed";
                  const colorKey = isClosed ? "i-can-swim-closed" : "i-can-swim";
                  const label = isClosed
                    ? (s.instructor_name || "Instructor")
                    : (s.client_name || s.session_type || "I Can Swim");
                  const subtitle = isClosed
                    ? `${fmtTime(s.start_time)} – ${fmtTime(s.end_time)} · Closed`
                    : `${fmtTime(s.start_time)} – ${fmtTime(s.end_time)} · ${s.status}`;
                  return renderBlock(
                    s.id,
                    startMins,
                    endMins,
                    colorKey,
                    label,
                    subtitle,
                    false,
                    () => setDetailBlock({ kind: "ics", session: s }),
                    true,
                    undefined,
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold">{label}</p>
                      <p>{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</p>
                      {s.instructor_name && <p>Instructor: {s.instructor_name}</p>}
                      {s.session_type && <p>Type: {s.session_type}</p>}
                      <p>Status: {s.status}</p>
                      <p>{s.confirmed_bookings}/{s.max_capacity} booked</p>
                    </div>
                  );
                })}

            {/* ── AD swim sessions (filtered to this column) ── */}
            {col.group === "ad" &&
              todaySessions
                .filter((s) => (s.session_name || s.swim_level) === col.sessionName)
                .map((s) => {
                const startMins = timeToMinutes(s.start_time);
                const endMins = timeToMinutes(s.end_time);
                const top = minutesToTop(startMins);
                const height = durationHeight(startMins, endMins);
                const sessionEnrollments = enrollments.filter((e) => e.session_id === s.id);
                const levelInfo = LEVEL_DISPLAY[s.swim_level as SwimLevel];
                const levelColor = LEVEL_COLORS[s.swim_level] || BLOCK_COLORS["swim"];

                return (
                  <Tooltip key={s.id} delayDuration={150}>
                    <TooltipTrigger asChild>
                      <div
                        className="absolute left-1 right-1 rounded-md border-l-[3px] px-2 py-1 overflow-hidden cursor-pointer hover:shadow-md z-10"
                        onMouseMove={(e) => e.stopPropagation()}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          backgroundColor: levelColor.bg,
                          borderLeftColor: levelColor.border,
                          color: levelColor.text,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailBlock({
                            kind: "swim",
                            session: s,
                            enrollments: sessionEnrollments,
                            attendance: attendance.filter((a) => a.session_id === s.id),
                            agreements,
                            dateStr,
                          });
                        }}
                      >
                        <p className="text-xs font-semibold truncate leading-tight">
                          {levelInfo?.name || s.swim_level}
                        </p>
                        {height > 28 && s.session_name && (
                          <p className="text-[10px] opacity-70 truncate leading-tight">
                            {s.session_name}
                          </p>
                        )}
                        {height > 40 && (
                          <p className="text-[10px] truncate leading-tight mt-0.5 opacity-60">
                            {sessionEnrollments.length}/{s.max_students} swimmers
                          </p>
                        )}
                        {height > 56 && sessionEnrollments.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {sessionEnrollments.slice(0, Math.floor((height - 56) / 14)).map((enr) => (
                              <p key={enr.id} className="text-[10px] truncate leading-tight flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 shrink-0" />
                                {enr.child_name}
                              </p>
                            ))}
                            {sessionEnrollments.length > Math.floor((height - 56) / 14) && (
                              <p className="text-[10px] opacity-50 truncate">
                                +{sessionEnrollments.length - Math.floor((height - 56) / 14)} more
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <div className="space-y-1 text-xs">
                        <p className="font-semibold">{levelInfo?.name || s.swim_level}{s.session_name ? ` · ${s.session_name}` : ""}</p>
                        <p>{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</p>
                        {s.instructors?.name && <p>Instructor: {s.instructors.name}</p>}
                        <p>{sessionEnrollments.length}/{s.max_students} swimmers</p>
                        {sessionEnrollments.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {sessionEnrollments.slice(0, 5).map((enr) => (
                              <li key={enr.id}>• {enr.child_name} (age {enr.child_age})</li>
                            ))}
                            {sessionEnrollments.length > 5 && <li>+{sessionEnrollments.length - 5} more</li>}
                          </ul>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}

            {/* ── AD pool events (private, semi-private) — only in first AD column ── */}
            {col.group === "ad" && col.id === columns.find(c => c.group === "ad")?.id &&
              adEvents.map((e) => {
                const startMins = timeToMinutes(e.start_time);
                const endMins = timeToMinutes(e.end_time);
                const colorKey = e.event_type;
                const dimmed = !activeFilters.has(e.event_type as ActivityType);

                return renderBlock(
                  e.id,
                  startMins,
                  endMins,
                  colorKey,
                  e.title,
                  e.instructor_name || e.pool_area,
                  dimmed,
                  () => setDetailBlock({ kind: "event", event: e }),
                  false,
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      onClick={(ev) => { ev.stopPropagation(); onEditEvent?.(e); }}
                      className="p-0.5 rounded hover:bg-white/50"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(ev) => { ev.stopPropagation(); setDeleteId(e.id); }}
                      className="p-0.5 rounded hover:bg-white/50"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>,
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold">{e.title}</p>
                    <p>{fmtTime(e.start_time)} – {fmtTime(e.end_time)}</p>
                    <p className="capitalize">Type: {e.event_type.replace(/-/g, " ")}</p>
                    {e.instructor_name && <p>Instructor: {e.instructor_name}</p>}
                    {e.pool_area && <p>Area: {e.pool_area}</p>}
                    {e.notes && <p className="opacity-80">{e.notes}</p>}
                  </div>
                );
              })}

            {/* ── Swim Lesson pool events — in first AD column ── */}
            {col.group === "ad" && col.id === columns.find(c => c.group === "ad")?.id &&
              swimLessonEvents.map((e) => {
                const startMins = timeToMinutes(e.start_time);
                const endMins = timeToMinutes(e.end_time);
                const dimmed = !activeFilters.has("swim");

                return renderBlock(
                  e.id,
                  startMins,
                  endMins,
                  "swim-lesson",
                  e.title,
                  e.instructor_name || e.notes || "",
                  dimmed,
                  () => setDetailBlock({ kind: "event", event: e }),
                  false,
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      onClick={(ev) => { ev.stopPropagation(); onEditEvent?.(e); }}
                      className="p-0.5 rounded hover:bg-white/50"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(ev) => { ev.stopPropagation(); setDeleteId(e.id); }}
                      className="p-0.5 rounded hover:bg-white/50"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>,
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold">{e.title}</p>
                    <p>{fmtTime(e.start_time)} – {fmtTime(e.end_time)}</p>
                    <p>Type: Swim Lesson</p>
                    {e.instructor_name && <p>Instructor: {e.instructor_name}</p>}
                    {e.pool_area && <p>Area: {e.pool_area}</p>}
                    {e.notes && <p className="opacity-80">{e.notes}</p>}
                  </div>
                );
              })}

            {col.group === "dive" &&
              diveRentalEvents.map((e) => {
                const startMins = timeToMinutes(e.start_time);
                const endMins = timeToMinutes(e.end_time);
                const colorKey = e.event_type;
                const dimmed = !activeFilters.has(e.event_type as ActivityType);

                return renderBlock(
                  e.id,
                  startMins,
                  endMins,
                  colorKey,
                  e.title,
                  e.instructor_name || e.notes || "",
                  dimmed,
                  () => setDetailBlock({ kind: "event", event: e }),
                  false,
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      onClick={(ev) => { ev.stopPropagation(); onEditEvent?.(e); }}
                      className="p-0.5 rounded hover:bg-white/50"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(ev) => { ev.stopPropagation(); setDeleteId(e.id); }}
                      className="p-0.5 rounded hover:bg-white/50"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>,
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold">{e.title}</p>
                    <p>{fmtTime(e.start_time)} – {fmtTime(e.end_time)}</p>
                    <p className="capitalize">Type: {e.event_type.replace(/-/g, " ")}</p>
                    {e.instructor_name && <p>Instructor: {e.instructor_name}</p>}
                    {e.pool_area && <p>Area: {e.pool_area}</p>}
                    {e.notes && <p className="opacity-80">{e.notes}</p>}
                  </div>
                );
              })}

            {/* ── Hover "+ add" indicator ── */}
            {hoverSlot?.colId === col.id && col.group !== "ics" && (
              <div
                className="absolute left-1 right-1 flex items-center justify-center text-xs text-muted-foreground/50 pointer-events-none"
                style={{ top: `${Math.round(hoverSlot.y / (HOUR_HEIGHT / 2)) * (HOUR_HEIGHT / 2) - 10}px` }}
              >
                <span className="bg-muted/60 rounded px-2 py-0.5 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> add
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      </div>

      {/* ── Block detail panel ── */}
      <CalendarBlockDetail
        block={detailBlock}
        onClose={() => setDetailBlock(null)}
        onEdit={() => {
          if (detailBlock?.kind === "event") {
            onEditEvent?.(detailBlock.event);
          }
          setDetailBlock(null);
        }}
        onCheckIn={handleCheckIn}
        onRefetch={onAttendanceChange}
      />

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
};

export default CalendarDayView;
