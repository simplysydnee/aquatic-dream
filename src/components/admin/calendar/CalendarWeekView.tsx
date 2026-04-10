import { format, isToday } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";
import type {
  CalendarSwimSession,
  CalendarEnrollment,
  CalendarPoolEvent,
} from "@/hooks/useCalendarData";
import { Waves, Anchor, Users, Wrench, Calendar } from "lucide-react";

interface Props {
  weekDates: Date[];
  currentDate: Date;
  swimSessions: CalendarSwimSession[];
  enrollments: CalendarEnrollment[];
  poolEvents: CalendarPoolEvent[];
  onSelectDate: (d: Date) => void;
}

const eventTypeIcon: Record<string, typeof Waves> = {
  "i-can-swim": Users,
  "private-lesson": Users,
  "semi-private-lesson": Users,
  "dive-session": Anchor,
  "pool-rental": Calendar,
  "maintenance": Wrench,
};

const eventTypeColor: Record<string, string> = {
  "i-can-swim": "bg-amber-100 border-amber-300",
  "private-lesson": "bg-pink-100 border-pink-300",
  "semi-private-lesson": "bg-orange-100 border-orange-300",
  "dive-session": "bg-emerald-100 border-emerald-300",
  "pool-rental": "bg-purple-100 border-purple-300",
  "maintenance": "bg-gray-100 border-gray-300",
};

const CalendarWeekView = ({ weekDates, currentDate, swimSessions, enrollments, poolEvents, onSelectDate }: Props) => {
  return (
    <div className="grid grid-cols-7 gap-1">
      {weekDates.map((date) => {
        const dayName = format(date, "EEEE");
        const dateStr = format(date, "yyyy-MM-dd");
        const daySessions = swimSessions.filter((s) => s.day_of_week === dayName);
        const dayEvents = poolEvents.filter((e) => e.event_date === dateStr);
        const totalItems = daySessions.length + dayEvents.length;

        return (
          <Card
            key={dateStr}
            className={cn(
              "p-2 min-h-[140px] cursor-pointer hover:shadow-md transition-shadow",
              isToday(date) && "ring-2 ring-primary"
            )}
            onClick={() => onSelectDate(date)}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className={cn(
                  "text-xs font-medium",
                  isToday(date) ? "text-primary" : "text-muted-foreground"
                )}
              >
                {format(date, "EEE")}
              </span>
              <span
                className={cn(
                  "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full",
                  isToday(date) && "bg-primary text-primary-foreground"
                )}
              >
                {format(date, "d")}
              </span>
            </div>

            <div className="space-y-1">
              {/* Swim sessions summary */}
              {daySessions.length > 0 && (
                <div className="flex items-center gap-1 text-xs bg-blue-50 rounded px-1.5 py-0.5 border border-blue-200">
                  <Waves className="w-3 h-3 text-blue-500" />
                  <span className="text-blue-700 truncate">
                    {daySessions.length} lesson{daySessions.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}

              {/* Pool events */}
              {dayEvents.slice(0, 3).map((event) => {
                const Icon = eventTypeIcon[event.event_type] || Calendar;
                const color = eventTypeColor[event.event_type] || "bg-gray-50 border-gray-200";
                return (
                  <div
                    key={event.id}
                    className={`flex items-center gap-1 text-xs rounded px-1.5 py-0.5 border ${color} truncate`}
                  >
                    <Icon className="w-3 h-3 shrink-0" />
                    <span className="truncate">{event.title}</span>
                  </div>
                );
              })}

              {dayEvents.length > 3 && (
                <p className="text-xs text-muted-foreground pl-1">
                  +{dayEvents.length - 3} more
                </p>
              )}

              {totalItems === 0 && (
                <p className="text-xs text-muted-foreground/50 text-center pt-2">—</p>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default CalendarWeekView;
