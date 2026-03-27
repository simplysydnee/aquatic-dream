import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";
import type {
  CalendarSwimSession,
  CalendarEnrollment,
  CalendarPoolEvent,
  AttendanceRecord,
} from "@/hooks/useCalendarData";
import { Waves, Anchor, Users, Wrench, Calendar } from "lucide-react";

interface Props {
  date: Date;
  swimSessions: CalendarSwimSession[];
  enrollments: CalendarEnrollment[];
  poolEvents: CalendarPoolEvent[];
  attendance: AttendanceRecord[];
  onAttendanceChange: () => void;
}

const TIME_SLOTS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
  "19:00", "19:30",
];

const eventTypeConfig: Record<string, { color: string; icon: typeof Waves; label: string }> = {
  "i-can-swim": { color: "bg-amber-100 border-amber-300 text-amber-800", icon: Users, label: "I Can Swim 209" },
  "dive-session": { color: "bg-emerald-100 border-emerald-300 text-emerald-800", icon: Anchor, label: "Dive Session" },
  "pool-rental": { color: "bg-purple-100 border-purple-300 text-purple-800", icon: Calendar, label: "Pool Rental" },
  "maintenance": { color: "bg-gray-100 border-gray-300 text-gray-800", icon: Wrench, label: "Maintenance" },
  "other": { color: "bg-gray-100 border-gray-300 text-gray-700", icon: Calendar, label: "Other" },
};

const areaLabel = (area: string) => {
  if (area === "shallow") return "Shallow End";
  if (area === "deep") return "Deep End";
  return "Full Pool";
};

const CalendarDayView = ({ date, swimSessions, enrollments, poolEvents, attendance, onAttendanceChange }: Props) => {
  const dateStr = format(date, "yyyy-MM-dd");
  const dayName = format(date, "EEEE");

  // Filter sessions for this day
  const todaySessions = swimSessions.filter((s) => s.day_of_week === dayName);
  const todayEvents = poolEvents.filter((e) => e.event_date === dateStr);

  const handleCheckIn = async (enrollmentId: string, sessionId: string, currentlyCheckedIn: boolean) => {
    if (currentlyCheckedIn) {
      // Uncheck
      await supabase
        .from("attendance")
        .delete()
        .eq("enrollment_id", enrollmentId)
        .eq("lesson_date", dateStr);
    } else {
      // Check in
      await supabase.from("attendance").upsert({
        enrollment_id: enrollmentId,
        session_id: sessionId,
        lesson_date: dateStr,
        checked_in: true,
        checked_in_at: new Date().toISOString(),
        checked_in_by: "admin",
      }, { onConflict: "enrollment_id,lesson_date" });
    }
    onAttendanceChange();
  };

  // Build timeline items
  type TimelineItem = {
    startTime: string;
    endTime: string;
    type: "swim" | "event";
    data: CalendarSwimSession | CalendarPoolEvent;
  };

  const items: TimelineItem[] = [
    ...todaySessions.map((s) => ({ startTime: s.start_time, endTime: s.end_time, type: "swim" as const, data: s })),
    ...todayEvents.map((e) => ({ startTime: e.start_time, endTime: e.end_time, type: "event" as const, data: e })),
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
    <div className="space-y-2">
      {activeSlots.map((slot) => {
        const slotItems = slotMap.get(slot) || [];
        return (
          <div key={slot} className="flex gap-3">
            {/* Time label */}
            <div className="w-16 shrink-0 pt-2 text-right">
              <span className="text-sm font-medium text-muted-foreground">
                {format(new Date(`2000-01-01T${slot}`), "h:mm a")}
              </span>
            </div>

            {/* Events at this time */}
            <div className="flex-1 flex flex-wrap gap-2">
              {slotItems.map((item) => {
                if (item.type === "swim") {
                  const session = item.data as CalendarSwimSession;
                  const sessionEnrollments = enrollments.filter(
                    (e) => e.session_id === session.id
                  );
                  const levelInfo = LEVEL_DISPLAY[session.swim_level as SwimLevel];

                  return (
                    <Card key={session.id} className="flex-1 min-w-[200px] max-w-[350px] p-3 border-l-4 border-l-blue-400">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Waves className="w-4 h-4 text-blue-500" />
                          <span className="font-medium text-sm">
                            {levelInfo?.name || session.swim_level}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {sessionEnrollments.length}/{session.max_students}
                        </Badge>
                      </div>
                      {session.age_group && (
                        <p className="text-xs text-muted-foreground mb-2">
                          {session.age_group === "preschool-3-5" ? "Preschool 3–5" : session.age_group === "school-5-8" ? "School-Age 5–8" : "Advanced 7+"}
                        </p>
                      )}
                      {/* Student roster with check-in */}
                      {sessionEnrollments.length > 0 ? (
                        <div className="space-y-1">
                          {sessionEnrollments.map((enr) => {
                            const att = attendance.find(
                              (a) => a.enrollment_id === enr.id && a.lesson_date === dateStr
                            );
                            const isCheckedIn = !!att?.checked_in;
                            return (
                              <div
                                key={enr.id}
                                className="flex items-center gap-2 text-sm py-0.5"
                              >
                                <Checkbox
                                  checked={isCheckedIn}
                                  onCheckedChange={() =>
                                    handleCheckIn(enr.id, session.id, isCheckedIn)
                                  }
                                />
                                <span className={isCheckedIn ? "line-through text-muted-foreground" : ""}>
                                  {enr.child_name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  (age {enr.child_age})
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No students enrolled</p>
                      )}
                    </Card>
                  );
                } else {
                  const event = item.data as CalendarPoolEvent;
                  const config = eventTypeConfig[event.event_type] || eventTypeConfig.other;
                  const Icon = config.icon;

                  return (
                    <Card
                      key={event.id}
                      className={`flex-1 min-w-[200px] max-w-[350px] p-3 border-l-4 ${
                        event.event_type === "i-can-swim" ? "border-l-amber-400" :
                        event.event_type === "dive-session" ? "border-l-emerald-500" :
                        event.event_type === "pool-rental" ? "border-l-purple-400" :
                        "border-l-gray-400"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-4 h-4" />
                        <span className="font-medium text-sm">{event.title}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{areaLabel(event.pool_area)}</span>
                        <span>·</span>
                        <span>
                          {format(new Date(`2000-01-01T${event.start_time}`), "h:mm a")} –{" "}
                          {format(new Date(`2000-01-01T${event.end_time}`), "h:mm a")}
                        </span>
                      </div>
                      {event.instructor_name && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Instructor: {event.instructor_name}
                        </p>
                      )}
                      {event.notes && (
                        <p className="text-xs text-muted-foreground mt-1">{event.notes}</p>
                      )}
                    </Card>
                  );
                }
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CalendarDayView;
