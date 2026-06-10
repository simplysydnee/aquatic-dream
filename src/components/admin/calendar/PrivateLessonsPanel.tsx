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
              Private Lessons
              <Badge variant="secondary" className="text-[10px]">{todays.length} booked</Badge>
              <Badge variant="outline" className="text-[10px]">{slots.length} open</Badge>
            </h3>
            <p className="text-xs text-muted-foreground">{format(date, "EEEE, MMM d")}</p>
          </div>
          <Button size="sm" onClick={() => handleBookSlot()}>
            <Plus className="w-4 h-4 mr-1" /> Book Lesson
          </Button>
        </div>

        {/* Booked lessons */}
        {todays.length > 0 ? (
          <div className="grid sm:grid-cols-2 gap-2 mb-3">
            {todays.map((p) => {
              const lessonLabel = p.lesson_type === "semi_private" ? "Semi-Private" : "Private";
              const borderColor = p.lesson_type === "semi_private" ? "#4B1528" : "#26215C";
              const bgColor = p.lesson_type === "semi_private" ? "#FBEAF0" : "#EEEDFE";
              return (
                <button
                  key={p.occurrence_id}
                  onClick={() => setDetail(p)}
                  className="text-left rounded-md border-l-4 p-2.5 hover:shadow-md transition-shadow"
                  style={{ borderLeftColor: borderColor, backgroundColor: bgColor }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: borderColor }}>{lessonLabel}</span>
                    {paymentBadge(p.payment_status)}
                  </div>
                  <p className="font-semibold text-sm text-foreground leading-tight">
                    {p.child_name || p.parent_name}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1 flex-wrap">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {fmtTime(p.start_time)}–{fmtTime(p.end_time)}</span>
                    {p.instructor_name && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {p.instructor_name}</span>}
                    <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> ${p.price_per_session}</span>
                    {!p.waiver_signed_at && (
                      <span className="flex items-center gap-1 text-orange-600"><ClipboardSignature className="w-3 h-3" /> Waiver pending</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic mb-3">No private lessons booked for this day.</p>
        )}

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

      <AdminBookPrivateLessonDialog
        open={bookOpen}
        onOpenChange={setBookOpen}
        prefill={prefill}
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
