import { useState, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";
import type {
  CalendarSwimSession,
  CalendarEnrollment,
  CalendarPoolEvent,
  AttendanceRecord,
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
  "i-can-swim":         { bg: "#E1F5EE", border: "#085041", text: "#085041" },
  "swim":               { bg: "#E6F1FB", border: "#0C447C", text: "#0C447C" },
  "private-lesson":     { bg: "#EEEDFE", border: "#26215C", text: "#26215C" },
  "semi-private-lesson":{ bg: "#FBEAF0", border: "#4B1528", text: "#4B1528" },
  "dive-session":       { bg: "#FAEEDA", border: "#633806", text: "#633806" },
  "pool-rental":        { bg: "#F1EFE8", border: "#2C2C2A", text: "#2C2C2A" },
  "maintenance":        { bg: "#F3F3F3", border: "#666",    text: "#333" },
  "other":              { bg: "#F3F3F3", border: "#666",    text: "#333" },
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
  icsSessions: ICSSession[];
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
}

const CalendarDayView = ({
  date,
  swimSessions,
  enrollments,
  poolEvents,
  attendance,
  icsSessions,
  activeFilters,
  onAttendanceChange,
  onEditEvent,
  onDeleteEvent,
  onAddEvent,
}: Props) => {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailBlock, setDetailBlock] = useState<BlockInfo | null>(null);
  const [hoverSlot, setHoverSlot] = useState<{ colId: string; y: number } | null>(null);
  const { toast } = useToast();

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

  // ── Aquatic Dreams sessions for today ──
  const todaySessions = useMemo(
    () => swimSessions.filter((s) => s.day_of_week === dayName),
    [swimSessions, dayName]
  );

  // ── Pool events for today (non-ICS) ──
  const todayEvents = useMemo(
    () => poolEvents.filter((e) => e.event_date === dateStr),
    [poolEvents, dateStr]
  );

  const adEvents = todayEvents.filter(
    (e) => !["dive-session", "pool-rental", "i-can-swim"].includes(e.event_type)
  );
  const diveRentalEvents = todayEvents.filter(
    (e) => ["dive-session", "pool-rental", "maintenance"].includes(e.event_type)
  );

  // ── Determine which groups are visible based on filters ──
  const showICS = activeFilters.has("i-can-swim");
  const showAD = activeFilters.has("swim") || activeFilters.has("private-lesson") || activeFilters.has("semi-private-lesson");
  const showDive = activeFilters.has("dive-session") || activeFilters.has("pool-rental");

  // ── Build columns ──
  const columns = useMemo<ColumnDef[]>(() => {
    const cols: ColumnDef[] = [];
    if (showICS) {
      icsInstructors.forEach((name, i) => {
        cols.push({ id: `ics-${i}`, label: name, group: "ics" });
      });
    }
    if (showAD) {
      cols.push({ id: "ad-1", label: "Group 1", group: "ad" });
    }
    if (showDive) {
      cols.push({ id: "dive", label: "Dive / Rental", group: "dive" });
    }
    return cols;
  }, [icsInstructors, showICS, showAD, showDive]);

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
    actions?: React.ReactNode
  ) => {
    const top = minutesToTop(startMins);
    const height = durationHeight(startMins, endMins);
    const colors = BLOCK_COLORS[colorKey] || BLOCK_COLORS.other;

    return (
      <div
        key={key}
        className={cn(
          "absolute left-1 right-1 rounded-md border-l-[3px] px-2 py-1 overflow-hidden transition-opacity cursor-pointer hover:shadow-md",
          dimmed && "opacity-[0.12]"
        )}
        style={{
          top: `${top}px`,
          height: `${height}px`,
          backgroundColor: colors.bg,
          borderLeftColor: colors.border,
          color: colors.text,
        }}
        onClick={onClick}
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
  };

  return (
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
              backgroundColor: "#E1F5EE",
              color: "#085041",
              flex: icsCount,
            }}
          >
            I Can Swim 209 — {todayICS.length > 0 ? icsInstructors.length : 0} instructor{icsInstructors.length !== 1 ? "s" : ""} today
          </div>
        )}
        {/* AD group */}
        {adCount > 0 && (
          <div
            className="text-center text-xs font-semibold py-1.5 border-l"
            style={{ backgroundColor: "#E6F1FB", color: "#0C447C", flex: adCount }}
          >
            Aquatic Dreams — {todaySessions.length + adEvents.length} group{(todaySessions.length + adEvents.length) !== 1 ? "s" : ""}
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

      {/* ── Column name headers ── */}
      <div className="flex border-b">
        <div className="w-16 shrink-0" />
        {columns.map((col) => (
          <div
            key={col.id}
            className="flex-1 text-center text-[11px] font-medium text-muted-foreground py-1.5 border-l truncate px-1"
          >
            {col.label}
          </div>
        ))}
      </div>

      {/* ── Time grid ── */}
      <div className="flex overflow-x-auto">
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
                  const dimmed = false;
                  return renderBlock(
                    s.id,
                    startMins,
                    endMins,
                    "i-can-swim",
                    s.client_name || s.session_type || "I Can Swim",
                    `${fmtTime(s.start_time)} – ${fmtTime(s.end_time)} · ${s.status}`,
                    dimmed,
                    () => setDetailBlock({ kind: "ics", session: s }),
                    true
                  );
                })}

            {/* ── AD swim sessions ── */}
            {col.group === "ad" &&
              todaySessions.map((s) => {
                const startMins = timeToMinutes(s.start_time);
                const endMins = timeToMinutes(s.end_time);
                const top = minutesToTop(startMins);
                const height = durationHeight(startMins, endMins);
                const sessionEnrollments = enrollments.filter((e) => e.session_id === s.id);
                const levelInfo = LEVEL_DISPLAY[s.swim_level as SwimLevel];
                const colors = BLOCK_COLORS["swim"];

                return (
                  <div
                    key={s.id}
                    className="absolute left-1 right-1 rounded-md border-l-[3px] px-2 py-1 overflow-hidden cursor-pointer hover:shadow-md"
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      backgroundColor: colors.bg,
                      borderLeftColor: colors.border,
                      color: colors.text,
                    }}
                    onClick={() =>
                      setDetailBlock({
                        kind: "swim",
                        session: s,
                        enrollments: sessionEnrollments,
                        attendance: attendance.filter((a) => a.session_id === s.id),
                        dateStr,
                      })
                    }
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
                );
              })}

            {/* ── AD pool events (private, semi-private) ── */}
            {col.group === "ad" &&
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
                  </div>
                );
              })}

            {/* ── Dive / Rental blocks ── */}
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
  );
};

export default CalendarDayView;
