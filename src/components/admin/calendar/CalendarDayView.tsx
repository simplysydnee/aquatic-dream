import { useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";
import type {
  CalendarSwimSession,
  CalendarEnrollment,
  CalendarPoolEvent,
  AttendanceRecord,
} from "@/hooks/useCalendarData";
import { Waves, Anchor, Users, Wrench, Calendar, Pencil, Trash2, ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface Props {
  date: Date;
  swimSessions: CalendarSwimSession[];
  enrollments: CalendarEnrollment[];
  poolEvents: CalendarPoolEvent[];
  attendance: AttendanceRecord[];
  onAttendanceChange: () => void;
  onEditEvent?: (event: CalendarPoolEvent) => void;
  onDeleteEvent?: (eventId: string) => void;
}

const TIME_SLOTS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
  "19:00", "19:30",
];

const eventColorConfig: Record<string, { bg: string; border: string; dot: string }> = {
  "swim":              { bg: "bg-blue-50",    border: "border-l-blue-400",    dot: "bg-blue-400" },
  "i-can-swim":        { bg: "bg-amber-50",   border: "border-l-amber-400",   dot: "bg-amber-400" },
  "private-lesson":    { bg: "bg-pink-50",    border: "border-l-pink-400",    dot: "bg-pink-400" },
  "semi-private-lesson": { bg: "bg-orange-50", border: "border-l-orange-400", dot: "bg-orange-400" },
  "dive-session":      { bg: "bg-emerald-50", border: "border-l-emerald-500", dot: "bg-emerald-500" },
  "pool-rental":       { bg: "bg-purple-50",  border: "border-l-purple-400",  dot: "bg-purple-400" },
  "maintenance":       { bg: "bg-gray-100",   border: "border-l-gray-400",    dot: "bg-gray-400" },
  "other":             { bg: "bg-gray-50",    border: "border-l-gray-400",    dot: "bg-gray-400" },
};

const eventTypeLabel: Record<string, string> = {
  "i-can-swim": "I Can Swim 209",
  "private-lesson": "Private Lesson",
  "semi-private-lesson": "Semi-Private Lesson",
  "dive-session": "Dive Session",
  "pool-rental": "Pool Rental",
  "maintenance": "Maintenance",
  "other": "Other",
};

const areaTag = (area: string) => {
  if (area === "shallow") return "Shallow";
  if (area === "deep") return "Deep";
  return "Full";
};

const CalendarDayView = ({
  date,
  swimSessions,
  enrollments,
  poolEvents,
  attendance,
  onAttendanceChange,
  onEditEvent,
  onDeleteEvent,
}: Props) => {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const dateStr = format(date, "yyyy-MM-dd");
  const dayName = format(date, "EEEE");

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

  const handleCheckIn = async (enrollmentId: string, sessionId: string, currentlyCheckedIn: boolean) => {
    if (currentlyCheckedIn) {
      await supabase
        .from("attendance")
        .delete()
        .eq("enrollment_id", enrollmentId)
        .eq("lesson_date", dateStr);
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

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Build unified timeline items
  type TimelineItem =
    | { type: "swim"; id: string; startTime: string; endTime: string; session: CalendarSwimSession }
    | { type: "event"; id: string; startTime: string; endTime: string; event: CalendarPoolEvent };

  const todaySessions = swimSessions.filter((s) => s.day_of_week === dayName);
  const todayEvents = poolEvents.filter((e) => e.event_date === dateStr);

  const items: TimelineItem[] = [
    ...todaySessions.map((s) => ({
      type: "swim" as const,
      id: s.id,
      startTime: s.start_time,
      endTime: s.end_time,
      session: s,
    })),
    ...todayEvents.map((e) => ({
      type: "event" as const,
      id: e.id,
      startTime: e.start_time,
      endTime: e.end_time,
      event: e,
    })),
  ].sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Group by time slot
  const slotMap = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const slotKey = item.startTime.slice(0, 5);
    if (!slotMap.has(slotKey)) slotMap.set(slotKey, []);
    slotMap.get(slotKey)!.push(item);
  }

  const activeSlots = TIME_SLOTS.filter((s) => slotMap.has(s));

  if (activeSlots.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="font-medium">No activities scheduled</p>
        <p className="text-sm">for {format(date, "EEEE, MMMM d")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Timeline */}
      {activeSlots.map((slot, slotIdx) => {
        const slotItems = slotMap.get(slot) || [];
        const timeLabel = format(new Date(`2000-01-01T${slot}`), "h:mm a");

        return (
          <div key={slot} className="flex">
            {/* Time gutter */}
            <div className="w-20 shrink-0 relative">
              <span className="text-xs font-semibold text-muted-foreground absolute top-3 right-3">
                {timeLabel}
              </span>
            </div>

            {/* Vertical line */}
            <div className="w-px bg-border relative shrink-0">
              <div className="absolute top-3 -left-1 w-2.5 h-2.5 rounded-full bg-border" />
            </div>

            {/* Activity bars */}
            <div className="flex-1 pl-4 pb-2 pt-1 space-y-1.5">
              {slotItems.map((item) => {
                if (item.type === "swim") {
                  const session = item.session;
                  const sessionEnrollments = enrollments.filter(
                    (e) => e.session_id === session.id
                  );
                  const levelInfo = LEVEL_DISPLAY[session.swim_level as SwimLevel];
                  const colors = eventColorConfig.swim;
                  const isExpanded = expandedIds.has(session.id);
                  const names = sessionEnrollments.map((e) => e.child_name);

                  return (
                    <Collapsible
                      key={session.id}
                      open={isExpanded}
                      onOpenChange={() => toggleExpand(session.id)}
                    >
                      <CollapsibleTrigger asChild>
                        <button
                          className={cn(
                            "w-full text-left rounded-lg border-l-4 px-3 py-2 transition-colors hover:brightness-95",
                            colors.bg,
                            colors.border
                          )}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className={cn("w-2 h-2 rounded-full shrink-0", colors.dot)} />
                            <span className="font-medium text-sm text-foreground">
                              {levelInfo?.name || session.swim_level}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({sessionEnrollments.length}/{session.max_students})
                            </span>
                            {session.age_group && (
                              <span className="text-xs text-muted-foreground">
                                · {session.age_group === "preschool-3-5" ? "3–5y" : session.age_group === "school-5-8" ? "5–8y" : "7+"}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">
                              {format(new Date(`2000-01-01T${session.start_time}`), "h:mm")}–
                              {format(new Date(`2000-01-01T${session.end_time}`), "h:mm a")}
                            </span>
                            {names.length > 0 && (
                              <>
                                <span className="text-muted-foreground hidden sm:inline">—</span>
                                <span className="text-sm text-foreground/80 hidden sm:inline">
                                  {names.join(" · ")}
                                </span>
                              </>
                            )}
                            <ChevronDown
                              className={cn(
                                "w-4 h-4 text-muted-foreground transition-transform ml-auto sm:ml-0",
                                isExpanded && "rotate-180"
                              )}
                            />
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className={cn("rounded-b-lg border-l-4 px-4 py-2 space-y-1", colors.bg, colors.border)}>
                          {sessionEnrollments.length > 0 ? (
                            sessionEnrollments.map((enr) => {
                              const att = attendance.find(
                                (a) => a.enrollment_id === enr.id && a.lesson_date === dateStr
                              );
                              const isCheckedIn = !!att?.checked_in;
                              return (
                                <div key={enr.id} className="flex items-center gap-2 text-sm py-0.5">
                                  <Checkbox
                                    checked={isCheckedIn}
                                    onCheckedChange={() =>
                                      handleCheckIn(enr.id, session.id, isCheckedIn)
                                    }
                                  />
                                  <span className={isCheckedIn ? "line-through text-muted-foreground" : ""}>
                                    {enr.child_name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">(age {enr.child_age})</span>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No students enrolled</p>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                } else {
                  const event = item.event;
                  const colors = eventColorConfig[event.event_type] || eventColorConfig.other;
                  const label = event.title || eventTypeLabel[event.event_type] || "Event";

                  return (
                    <div
                      key={event.id}
                      className={cn(
                        "w-full rounded-lg border-l-4 px-3 py-2",
                        colors.bg,
                        colors.border
                      )}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className={cn("w-2 h-2 rounded-full shrink-0", colors.dot)} />
                        <span className="font-medium text-sm text-foreground">{label}</span>
                        <span className="text-xs text-muted-foreground">
                          {areaTag(event.pool_area)}
                        </span>
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {format(new Date(`2000-01-01T${event.start_time}`), "h:mm")}–
                          {format(new Date(`2000-01-01T${event.end_time}`), "h:mm a")}
                        </span>
                        {event.instructor_name && (
                          <>
                            <span className="text-muted-foreground hidden sm:inline">—</span>
                            <span className="text-sm text-foreground/80 hidden sm:inline">
                              {event.instructor_name}
                            </span>
                          </>
                        )}
                        {event.notes && (
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            · {event.notes}
                          </span>
                        )}
                        {/* Edit / Delete */}
                        <div className="flex items-center gap-0.5 ml-auto">
                          <button
                            onClick={() => onEditEvent?.(event)}
                            className="p-1 rounded hover:bg-muted transition-colors"
                            title="Edit event"
                          >
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => setDeleteId(event.id)}
                            className="p-1 rounded hover:bg-destructive/10 transition-colors"
                            title="Delete event"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          </div>
        );
      })}

      {/* Delete confirmation */}
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
