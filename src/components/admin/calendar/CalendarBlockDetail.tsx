import { format } from "date-fns";
import { X, Clock, User, Pencil, UserPlus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarSwimSession, CalendarEnrollment, CalendarPoolEvent, AttendanceRecord } from "@/hooks/useCalendarData";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";
import { Checkbox } from "@/components/ui/checkbox";

interface SwimBlockInfo {
  kind: "swim";
  session: CalendarSwimSession;
  enrollments: CalendarEnrollment[];
  attendance: AttendanceRecord[];
  dateStr: string;
}

interface EventBlockInfo {
  kind: "event";
  event: CalendarPoolEvent;
}

type BlockInfo = SwimBlockInfo | EventBlockInfo;

interface Props {
  block: BlockInfo | null;
  onClose: () => void;
  onEdit: () => void;
  onCheckIn?: (enrollmentId: string, sessionId: string, isCheckedIn: boolean) => void;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const CalendarBlockDetail = ({ block, onClose, onEdit, onCheckIn }: Props) => {
  if (!block) return null;

  const isSwim = block.kind === "swim";
  const title = isSwim
    ? LEVEL_DISPLAY[block.session.swim_level as SwimLevel]?.name || block.session.swim_level
    : block.event.title;

  const startTime = isSwim ? block.session.start_time : block.event.start_time;
  const endTime = isSwim ? block.session.end_time : block.event.end_time;
  const instructor = isSwim ? null : block.event.instructor_name;

  const fmtTime = (t: string) => format(new Date(`2000-01-01T${t}`), "h:mm a");

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-sm bg-card border-l shadow-xl h-full overflow-y-auto animate-in slide-in-from-right-full duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b px-4 py-3 flex items-start justify-between z-10">
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isSwim ? block.session.day_of_week : format(new Date(block.event.event_date + "T00:00:00"), "EEEE, MMM d")}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info tiles */}
        <div className="grid grid-cols-2 gap-3 p-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Clock className="w-3.5 h-3.5" /> Time
            </div>
            <p className="text-sm font-medium">{fmtTime(startTime)} – {fmtTime(endTime)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <User className="w-3.5 h-3.5" /> {isSwim ? "Capacity" : "Instructor"}
            </div>
            <p className="text-sm font-medium">
              {isSwim
                ? `${block.enrollments.length}/${block.session.max_students}`
                : instructor || "—"}
            </p>
          </div>
        </div>

        {/* Roster */}
        {isSwim && (
          <div className="px-4 pb-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Roster ({block.enrollments.length})
            </h4>
            {block.enrollments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No students enrolled</p>
            ) : (
              <div className="space-y-2">
                {block.enrollments.map((enr) => {
                  const att = block.attendance.find(
                    (a) => a.enrollment_id === enr.id && a.lesson_date === block.dateStr
                  );
                  const isCheckedIn = !!att?.checked_in;
                  return (
                    <div key={enr.id} className="flex items-center gap-3 py-1.5">
                      <Checkbox
                        checked={isCheckedIn}
                        onCheckedChange={() => onCheckIn?.(enr.id, block.session.id, isCheckedIn)}
                      />
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                        {getInitials(enr.child_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium", isCheckedIn && "line-through text-muted-foreground")}>
                          {enr.child_name}
                        </p>
                        <p className="text-xs text-muted-foreground">Age {enr.child_age}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="sticky bottom-0 bg-card border-t p-4 flex gap-2">
          <Button size="sm" variant="outline" onClick={onEdit} className="flex-1 gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
          {isSwim && (
            <Button size="sm" variant="outline" className="flex-1 gap-1.5">
              <UserPlus className="w-3.5 h-3.5" /> Add Swimmer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalendarBlockDetail;
export type { BlockInfo, SwimBlockInfo, EventBlockInfo };
