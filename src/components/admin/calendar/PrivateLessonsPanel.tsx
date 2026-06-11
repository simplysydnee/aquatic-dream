import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Clock, User, CreditCard, ClipboardSignature } from "lucide-react";
import type { PrivateLessonBooking, OpenPrivateSlot } from "@/hooks/useCalendarData";
import { cn } from "@/lib/utils";
import BookingQuickDialog from "@/components/admin/booking/BookingQuickDialog";
import PrivateLessonDetailDialog from "./PrivateLessonDetailDialog";

interface Props {
  date: Date;
  privateLessons: PrivateLessonBooking[];
  openSlots: OpenPrivateSlot[];
  onRefetch: () => void;
}

function fmtTime(t: string) {
  if (!t) return "";
  return format(new Date(`2000-01-01T${t}`), "h:mm a");
}

const paymentBadge = (status: string) => {
  const map: Record<string, string> = {
    paid: "bg-green-100 text-green-800 border-green-300",
    card_on_file: "bg-blue-100 text-blue-800 border-blue-300",
    unpaid: "bg-orange-100 text-orange-800 border-orange-300",
    comp: "bg-purple-100 text-purple-800 border-purple-300",
  };
  const cls = map[status] || "bg-muted text-foreground border-border";
  const label = status === "card_on_file" ? "Card on file" : status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge variant="outline" className={cn("text-[10px]", cls)}>{label}</Badge>;
};

export default function PrivateLessonsPanel({ date, privateLessons, openSlots, onRefetch }: Props) {
  const dateStr = format(date, "yyyy-MM-dd");
  const [bookOpen, setBookOpen] = useState(false);
  const [prefill, setPrefill] = useState<any>(null);
  const [detail, setDetail] = useState<PrivateLessonBooking | null>(null);

  const todays = useMemo(
    () => privateLessons.filter((p) => p.occurrence_date === dateStr).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [privateLessons, dateStr]
  );
  const slots = useMemo(
    () => openSlots.filter((s) => s.slot_date === dateStr).sort((a, b) => a.start_time.localeCompare(b.start_time) || a.instructor_name.localeCompare(b.instructor_name)),
    [openSlots, dateStr]
  );

  const handleBookSlot = (s?: OpenPrivateSlot) => {
    setPrefill(
      s
        ? {
            instructor_id: s.instructor_id,
            instructor_name: s.instructor_name,
            date: s.slot_date,
            start_time: s.start_time,
            end_time: s.end_time,
            pool_area: s.pool_area,
            lesson_type: s.default_lesson_type,
          }
        : { date: dateStr }
    );
    setBookOpen(true);
  };

  return (
    <>
      <Card className="p-4 max-w-full overflow-x-hidden">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              Open Private Slots
              <Badge variant="outline" className="text-[10px]">{slots.length} open</Badge>
              {todays.length > 0 && (
                <Badge variant="secondary" className="text-[10px]" title="Booked lessons appear on the calendar grid above">
                  {todays.length} booked (on grid)
                </Badge>
              )}
            </h3>
            <p className="text-xs text-muted-foreground">{format(date, "EEEE, MMM d")}</p>
          </div>
          <Button size="sm" onClick={() => handleBookSlot()}>
            <Plus className="w-4 h-4 mr-1" /> Book Lesson
          </Button>
        </div>


        {/* Open slots */}
        {slots.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Open slots</p>
            <div className="flex flex-wrap gap-1.5">
              {slots.map((s, i) => (
                <button
                  key={`${s.instructor_id}-${s.start_time}-${i}`}
                  onClick={() => handleBookSlot(s)}
                  className="rounded border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-2 py-1.5 text-left transition-colors"
                  title={`Book ${s.instructor_name} at ${fmtTime(s.start_time)}`}
                >
                  <div className="text-[11px] font-semibold text-foreground">{fmtTime(s.start_time)}</div>
                  <div className="text-[10px] text-muted-foreground">{s.instructor_name}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <BookingQuickDialog
        open={bookOpen}
        onOpenChange={setBookOpen}
        initialSlot={prefill ? {
          mode: prefill.start_time ? "one_time" : undefined,
          instructorId: prefill.instructor_id,
          instructorName: prefill.instructor_name,
          date: prefill.date,
          startTime: prefill.start_time,
          endTime: prefill.end_time,
          poolArea: prefill.pool_area,
        } : undefined}
        initialType={prefill?.lesson_type === "semi_private" ? "semi_private" : "private"}
        onBooked={onRefetch}
      />
      <PrivateLessonDetailDialog
        lesson={detail}
        onClose={() => setDetail(null)}
        onChanged={onRefetch}
      />
    </>
  );
}
