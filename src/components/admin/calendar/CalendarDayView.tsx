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
import { Lock, Plus, Pencil, Trash2, Camera } from "lucide-react";
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
import { useIsMobile } from "@/hooks/use-mobile";

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
const HOUR_HEIGHT_DESKTOP = 80; // px per hour (desktop)
const HOUR_HEIGHT_MOBILE = 48;  // px per hour (mobile, ~40% less scroll)
const START_HOUR = 7;
const END_HOUR = 20;
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

// minutesToTop / durationHeight are defined inside the component so they can use
// the active HOUR_HEIGHT (mobile vs desktop).


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
  const isMobile = useIsMobile();
  const HOUR_HEIGHT = isMobile ? HOUR_HEIGHT_MOBILE : HOUR_HEIGHT_DESKTOP;
  const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
  const minutesToTop = (mins: number) => ((mins - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const durationHeight = (startMins: number, endMins: number) =>
    Math.max(((endMins - startMins) / 60) * HOUR_HEIGHT, isMobile ? 20 : 24);

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

  // Total swimmers across today's ICS sessions + per-instructor breakdown
  const icsTotalSwimmers = useMemo(
    () => todayICS.reduce((sum, s) => sum + (s.confirmed_bookings || 0), 0),
    [todayICS]
  );
  const icsSwimmersByInstructor = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of todayICS) {
      const n = s.instructor_name || "Instructor";
      m.set(n, (m.get(n) || 0) + (s.confirmed_bookings || 0));
    }
    return m;
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

  // Map session_id -> overridden instructor name for the selected date
  const sessionInstructorOverrideToday = useMemo(() => {
    const m = new Map<string, string>();
    for (const ld of lessonDates) {
      if (ld.lesson_date !== dateStr || ld.is_cancelled) continue;
      if (ld.instructor_override_name) m.set(ld.session_id, ld.instructor_override_name);
    }
    return m;
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

  // ── Lane assignment per AD column for overlapping sessions ──
  // Map: session.id -> { lane, laneCount }
  const sessionLanes = useMemo(() => {
    const result = new Map<string, { lane: number; laneCount: number }>();
    // Group by column key (session_name || swim_level)
    const byCol = new Map<string, typeof todaySessions>();
    for (const s of todaySessions) {
      const key = s.session_name || s.swim_level;
      if (!byCol.has(key)) byCol.set(key, [] as any);
      byCol.get(key)!.push(s);
    }
    for (const [, list] of byCol) {
      const sorted = [...list].sort(
        (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
      );
      // sweep-line lane assignment, grouped into overlap clusters
      let cluster: { id: string; start: number; end: number; lane: number }[] = [];
      let clusterEnd = -1;
      const flush = () => {
        const count = cluster.reduce((m, c) => Math.max(m, c.lane + 1), 0);
        for (const c of cluster) result.set(c.id, { lane: c.lane, laneCount: count });
        cluster = [];
        clusterEnd = -1;
      };
      for (const s of sorted) {
        const start = timeToMinutes(s.start_time);
        const end = timeToMinutes(s.end_time);
        if (cluster.length && start >= clusterEnd) flush();
        // find first free lane
        const usedLanes = new Set(cluster.filter((c) => c.end > start).map((c) => c.lane));
        let lane = 0;
        while (usedLanes.has(lane)) lane++;
        cluster.push({ id: s.id, start, end, lane });
        clusterEnd = Math.max(clusterEnd, end);
      }
      if (cluster.length) flush();
    }
    return result;
  }, [todaySessions]);

  // ── Lane assignment for overlapping AD pool events (private/semi-private/walk-in) ──
  const adEventLanes = useMemo(() => {
    const result = new Map<string, { lane: number; laneCount: number }>();
    const sorted = [...adEvents].sort(
      (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
    );
    let cluster: { id: string; start: number; end: number; lane: number }[] = [];
    let clusterEnd = -1;
    const flush = () => {
      const count = cluster.reduce((m, c) => Math.max(m, c.lane + 1), 0);
      for (const c of cluster) result.set(c.id, { lane: c.lane, laneCount: count });
      cluster = [];
      clusterEnd = -1;
    };
    for (const e of sorted) {
      const start = timeToMinutes(e.start_time);
      const end = timeToMinutes(e.end_time);
      if (cluster.length && start >= clusterEnd) flush();
      const usedLanes = new Set(cluster.filter((c) => c.end > start).map((c) => c.lane));
      let lane = 0;
      while (usedLanes.has(lane)) lane++;
      cluster.push({ id: e.id, start, end, lane });
      clusterEnd = Math.max(clusterEnd, end);
    }
    if (cluster.length) flush();
    return result;
  }, [adEvents]);

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

  // ── Mobile agenda items (flat, time-sorted) ──
  type AgendaItem = {
    key: string;
    startMins: number;
    endMins: number;
    startLabel: string;
    endLabel: string;
    colorKey: string;
    levelKey?: string; // for swim level color override
    title: string;
    subtitle?: string;
    extra?: string;
    dimmed: boolean;
    onClick: () => void;
    locked?: boolean;
    photoOk?: boolean;
  };

  // Helper: every enrollment in a class has photo_release_accepted === true
  const sessionPhotoConsentMap = useMemo(() => {
    const agreementByEnrollment = new Map(
      agreements.map((a) => [a.enrollment_id, a.photo_release_accepted === true]),
    );
    const result = new Map<string, boolean>();
    swimSessions.forEach((s) => {
      const ses = enrollments.filter((e) => e.session_id === s.id);
      if (ses.length === 0) {
        result.set(s.id, false);
        return;
      }
      result.set(s.id, ses.every((e) => agreementByEnrollment.get(e.id) === true));
    });
    return result;
  }, [swimSessions, enrollments, agreements]);

  const agendaItems = useMemo<AgendaItem[]>(() => {
    if (!isMobile) return [];
    const items: AgendaItem[] = [];

    if (showICS) {
      todayICS.forEach((s) => {
        const isClosed = s.status?.toLowerCase() === "closed";
        const colorKey = isClosed ? "i-can-swim-closed" : "i-can-swim";
        const bookedCount = Math.max(s.confirmed_bookings ?? 0, s.client_name ? 1 : 0);
        const title = isClosed
          ? (s.instructor_name || "Instructor")
          : (s.client_name || s.session_type || "I Can Swim");
        items.push({
          key: `ics-${s.id}`,
          startMins: timeToMinutes(s.start_time),
          endMins: timeToMinutes(s.end_time),
          startLabel: fmtTime(s.start_time),
          endLabel: fmtTime(s.end_time),
          colorKey,
          title,
          subtitle: s.instructor_name ? `Coach ${s.instructor_name}` : "I Can Swim 209",
          extra: isClosed ? "Closed" : `${bookedCount}/${s.max_capacity} booked`,
          dimmed: false,
          locked: true,
          onClick: () => setDetailBlock({ kind: "ics", session: s }),
        });
      });
    }

    if (showAD) {
      todaySessions.forEach((s) => {
        const sessionEnrollments = enrollments.filter((e) => e.session_id === s.id);
        const levelInfo = LEVEL_DISPLAY[s.swim_level as SwimLevel];
        items.push({
          key: `ad-${s.id}`,
          startMins: timeToMinutes(s.start_time),
          endMins: timeToMinutes(s.end_time),
          startLabel: fmtTime(s.start_time),
          endLabel: fmtTime(s.end_time),
          colorKey: "swim",
          levelKey: s.swim_level,
          title: levelInfo?.name || s.swim_level,
          subtitle: (() => {
            const effName = sessionInstructorOverrideToday.get(s.id) || s.instructors?.name;
            return s.session_name || (effName ? `Coach ${effName}` : undefined);
          })(),
          extra: `${sessionEnrollments.length}/${s.max_students} swimmers`,
          dimmed: false,
          photoOk: sessionPhotoConsentMap.get(s.id) === true,
          onClick: () =>
            setDetailBlock({
              kind: "swim",
              session: s,
              enrollments: sessionEnrollments,
              attendance: attendance.filter((a) => a.session_id === s.id),
              agreements,
              dateStr,
            }),
        });
      });

      adEvents.forEach((e) => {
        items.push({
          key: `event-${e.id}`,
          startMins: timeToMinutes(e.start_time),
          endMins: timeToMinutes(e.end_time),
          startLabel: fmtTime(e.start_time),
          endLabel: fmtTime(e.end_time),
          colorKey: e.event_type,
          title: e.title,
          subtitle: e.instructor_name || e.pool_area,
          dimmed: !activeFilters.has(e.event_type as ActivityType),
          onClick: () => setDetailBlock({ kind: "event", event: e }),
        });
      });

      swimLessonEvents.forEach((e) => {
        items.push({
          key: `swl-${e.id}`,
          startMins: timeToMinutes(e.start_time),
          endMins: timeToMinutes(e.end_time),
          startLabel: fmtTime(e.start_time),
          endLabel: fmtTime(e.end_time),
          colorKey: "swim-lesson",
          title: e.title,
          subtitle: e.instructor_name || e.notes || undefined,
          dimmed: !activeFilters.has("swim"),
          onClick: () => setDetailBlock({ kind: "event", event: e }),
        });
      });
    }

    if (showDive) {
      diveRentalEvents.forEach((e) => {
        items.push({
          key: `dr-${e.id}`,
          startMins: timeToMinutes(e.start_time),
          endMins: timeToMinutes(e.end_time),
          startLabel: fmtTime(e.start_time),
          endLabel: fmtTime(e.end_time),
          colorKey: e.event_type,
          title: e.title,
          subtitle: e.instructor_name || e.pool_area,
          dimmed: !activeFilters.has(e.event_type as ActivityType),
          onClick: () => setDetailBlock({ kind: "event", event: e }),
        });
      });
    }

    return items.sort((a, b) => a.startMins - b.startMins);
  }, [
    isMobile, showICS, showAD, showDive, todayICS, todaySessions, enrollments,
    attendance, agreements, dateStr, adEvents, swimLessonEvents, diveRentalEvents,
    activeFilters,
  ]);

  // Group agenda items by hour bucket (skip empty hours)
  const agendaByHour = useMemo(() => {
    const map = new Map<number, AgendaItem[]>();
    agendaItems.forEach((it) => {
      const h = Math.floor(it.startMins / 60);
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push(it);
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [agendaItems]);

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
    tooltip?: React.ReactNode,
    lane?: number,
    laneCount?: number
  ) => {
    const top = minutesToTop(startMins);
    const height = durationHeight(startMins, endMins);
    const colors = BLOCK_COLORS[colorKey] || BLOCK_COLORS.other;

    const useLanes = laneCount && laneCount > 1 && typeof lane === "number";
    const laneStyle = useLanes
      ? {
          left: `calc((100% - 4px) / ${laneCount} * ${lane} + 2px)`,
          width: `calc((100% - 4px) / ${laneCount} - 2px)`,
        }
      : undefined;

    const blockEl = (
      <div
        key={key}
        className={cn(
          "absolute rounded-md border-l-[3px] px-2 py-1 overflow-hidden transition-opacity cursor-pointer hover:shadow-md z-10",
          !useLanes && "left-1 right-1",
          dimmed && "opacity-[0.12]"
        )}
        style={{
          top: `${top}px`,
          height: `${height}px`,
          backgroundColor: colors.bg,
          borderLeftColor: colors.border,
          color: colors.text,
          ...(laneStyle || {}),
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
    <div className="border rounded-lg bg-card overflow-hidden max-w-full">
      {/* ── Group headers (desktop only) ── */}
      {!isMobile && (
      <div className="flex border-b">
        {/* Time gutter */}
        <div className="w-16 shrink-0" />
        {/* ICS group */}
        {icsCount > 0 && (
          <div
            className="flex items-center justify-center gap-2 text-xs font-semibold py-1.5 border-l px-2"
            style={{
              backgroundColor: "#d4f0f8",
              color: "#2a5e84",
              flex: icsCount,
            }}
          >
            <span>I Can Swim 209</span>
            {todayICS.length === 0 ? (
              <span className="font-normal opacity-70">— None today</span>
            ) : (
              <span className="flex items-center gap-1.5 font-normal flex-wrap">
                <span title="Instructors with classes today" className="px-1.5 py-0.5 rounded bg-white/60">
                  {icsInstructors.length} {icsInstructors.length === 1 ? "instructor" : "instructors"}
                </span>
                {icsTotalSwimmers > 0 && (
                  <span title="Confirmed swimmers across today's ICS classes" className="px-1.5 py-0.5 rounded bg-white/60">
                    {icsTotalSwimmers} {icsTotalSwimmers === 1 ? "swimmer" : "swimmers"}
                  </span>
                )}
              </span>
            )}
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
      )}

      {/* ── Instructors today (clickable to open day-modal) ── */}
      {(() => {
        const names = new Set<string>();
        todaySessions.forEach((s) => {
          const eff = sessionInstructorOverrideToday.get(s.id) || s.instructors?.name;
          if (eff) names.add(eff);
        });
        adEvents.forEach((e) => e.instructor_name && names.add(e.instructor_name));
        swimLessonEvents.forEach((e) => e.instructor_name && names.add(e.instructor_name));
        const adList = [...names].sort();
        const icsList = [...icsSwimmersByInstructor.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        if (adList.length === 0 && icsList.length === 0) return null;
        return (
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b bg-muted/20">
            <span className="text-[11px] font-medium text-muted-foreground mr-1">Instructors today:</span>
            {adList.map((n) => (
              <button
                key={`ad-${n}`}
                onClick={() => setOpenInstructor(n)}
                className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs hover:bg-accent hover:border-primary/50 transition-colors"
              >
                <UserCircle2 className="w-3 h-3" />
                {n}
              </button>
            ))}
            {icsList.map(([n, count]) => (
              <span
                key={`ics-${n}`}
                title={`I Can Swim 209 — ${count} ${count === 1 ? "swimmer" : "swimmers"}`}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                style={{ backgroundColor: "#d4f0f8", borderColor: "#2a5e84", color: "#2a5e84" }}
              >
                <UserCircle2 className="w-3 h-3" />
                {n} <span className="font-semibold">({count})</span>
              </span>
            ))}
          </div>
        );
      })()}

      {isMobile ? (
        /* ── Mobile: stacked agenda by hour ── */
        <div ref={scrollRef} className="overflow-y-auto overflow-x-hidden max-w-full" style={{ maxHeight: "calc(100vh - 240px)" }}>
          {agendaByHour.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              Nothing scheduled
            </div>
          ) : (
            <div className="divide-y">
              {agendaByHour.map(([hour, items]) => {
                const hourLabel = hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`;
                const isCurrentHour = format(date, "yyyy-MM-dd") === format(now, "yyyy-MM-dd") &&
                  new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })).getHours() === hour;
                return (
                  <div key={hour} className="bg-background">
                    <div className={cn(
                      "sticky top-0 z-10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide bg-muted/80 backdrop-blur border-b",
                      isCurrentHour ? "text-primary" : "text-muted-foreground"
                    )}>
                      {hourLabel}{isCurrentHour && <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle" />}
                    </div>
          <div className="p-2 space-y-1.5 min-w-0">
                      {items.map((it) => {
                        const lvlColor = it.levelKey ? LEVEL_COLORS[it.levelKey] : null;
                        const colors = lvlColor || BLOCK_COLORS[it.colorKey] || BLOCK_COLORS.other;
                        return (
                          <button
                            key={it.key}
                            onClick={it.onClick}
                            className={cn(
                              "w-full max-w-full text-left rounded-md border-l-4 px-3 py-2 transition-opacity active:opacity-70 overflow-hidden",
                              it.dimmed && "opacity-40"
                            )}
                            style={{
                              backgroundColor: colors.bg,
                              borderLeftColor: colors.border,
                              color: colors.text,
                            }}
                          >
                            <div className="min-w-0 w-full">
                              <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-semibold opacity-80">
                            <span className="min-w-0 break-words">{it.startLabel} – {it.endLabel}</span>
                                {it.locked && <Lock className="w-3 h-3 opacity-60" />}
                              </div>
                          {it.extra && (
                            <p className="mt-0.5 text-[11px] font-medium opacity-70 break-words">
                              {it.extra}
                            </p>
                          )}
                              <p className="text-sm font-semibold leading-tight mt-0.5 break-words flex items-center gap-1">
                                {it.title}
                                {it.photoOk && (
                                  <Camera className="w-3.5 h-3.5 shrink-0 opacity-80" aria-label="All swimmers have photo consent" />
                                )}
                              </p>
                              {it.subtitle && (
                                <p className="text-xs opacity-75 leading-tight mt-0.5 break-words">{it.subtitle}</p>
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
        </div>
      ) : (
        <>
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
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: isMobile ? "calc(100vh - 240px)" : "calc(100vh - 320px)" }}>
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
            style={{ height: `${TOTAL_HEIGHT}px`, minWidth: isMobile ? "140px" : "120px" }}
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
                  const bookedCount = Math.max(s.confirmed_bookings ?? 0, s.client_name ? 1 : 0);
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
                      <p>{bookedCount}/{s.max_capacity} booked</p>
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
                const isClosed = s.registration_status === "closed";
                const isFull = sessionEnrollments.length >= s.max_students;

                const blockBg = isClosed ? "#e5e7eb" : levelColor.bg;
                const blockBorder = isClosed ? "#9ca3af" : levelColor.border;
                const blockText = isClosed ? "#4b5563" : levelColor.text;

                const laneInfo = sessionLanes.get(s.id) || { lane: 0, laneCount: 1 };
                const laneWidthPct = 100 / laneInfo.laneCount;
                const laneLeftPct = laneInfo.lane * laneWidthPct;

                return (
                  <Tooltip key={s.id} delayDuration={150}>
                    <TooltipTrigger asChild>
                      <div
                        className="absolute rounded-md border-l-[3px] px-2 py-1 overflow-hidden cursor-pointer hover:shadow-md z-10"
                        onMouseMove={(e) => e.stopPropagation()}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          left: `calc(${laneLeftPct}% + 4px)`,
                          width: `calc(${laneWidthPct}% - 6px)`,
                          backgroundColor: blockBg,
                          borderLeftColor: blockBorder,
                          color: blockText,
                          opacity: isClosed ? 0.85 : 1,
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
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-semibold truncate leading-tight flex-1 min-w-0 flex items-center gap-1">
                            <span className="truncate">{levelInfo?.name || s.swim_level}</span>
                            {sessionPhotoConsentMap.get(s.id) === true && (
                              <Camera className="w-3 h-3 shrink-0 opacity-80" aria-label="All swimmers have photo consent" />
                            )}
                          </p>
                          {isClosed ? (
                            <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-500/80 text-white tracking-wide">
                              Closed
                            </span>
                          ) : isFull ? (
                            <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-600 text-white tracking-wide">
                              Full {sessionEnrollments.length}/{s.max_students}
                            </span>
                          ) : (
                            <span
                              className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded leading-none"
                              style={{ backgroundColor: blockBorder, color: blockBg }}
                            >
                              {sessionEnrollments.length}/{s.max_students}
                            </span>
                          )}
                        </div>
                        {height > 28 && s.session_name && (
                          <p className="text-[10px] opacity-70 truncate leading-tight">
                            {s.session_name}
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
                        <p className="font-semibold">
                          {levelInfo?.name || s.swim_level}{s.session_name ? ` · ${s.session_name}` : ""}
                          {isClosed && <span className="ml-1 text-muted-foreground">(Closed)</span>}
                        </p>
                        <p>{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</p>
                        {(() => {
                          const eff = sessionInstructorOverrideToday.get(s.id) || s.instructors?.name;
                          const isOverride = !!sessionInstructorOverrideToday.get(s.id);
                          return eff ? <p>Instructor: {eff}{isOverride ? " (reassigned)" : ""}</p> : null;
                        })()}
                        <p>{sessionEnrollments.length}/{s.max_students} swimmers</p>
                        {sessionPhotoConsentMap.get(s.id) === true && (
                          <p className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <Camera className="w-3 h-3" /> All swimmers have photo consent
                          </p>
                        )}
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
                const laneInfo = adEventLanes.get(e.id);

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
                  </div>,
                  laneInfo?.lane,
                  laneInfo?.laneCount
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
        </>
      )}

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

      {/* ── Instructor day modal ── */}
      {openInstructor && (
        <InstructorDayModal
          open={!!openInstructor}
          onOpenChange={(o) => !o && setOpenInstructor(null)}
          instructorName={openInstructor}
          initialDate={date}
          onChanged={onAttendanceChange}
        />
      )}
    </div>
    </TooltipProvider>
  );
};

export default CalendarDayView;
