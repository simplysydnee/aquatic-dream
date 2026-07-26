import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CalendarCog, Loader2 } from "lucide-react";
import type { PrivateLessonBooking, OpenPrivateSlot } from "@/hooks/useCalendarData";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BookingQuickDialog from "@/components/admin/booking/BookingQuickDialog";
import PrivateLessonDetailDialog from "./PrivateLessonDetailDialog";
import ReschedulePrivateLessonDialog from "@/components/admin/booking/ReschedulePrivateLessonDialog";
import QuickEditLessonDialog, { type QuickEditLesson } from "@/components/admin/booking/QuickEditLessonDialog";

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
  const label = status === "card_on_file" ? "Card on file" : (status || "").charAt(0).toUpperCase() + (status || "").slice(1);
  return <Badge variant="outline" className={cn("text-[10px]", cls)}>{label}</Badge>;
};

export default function PrivateLessonsPanel({ date, privateLessons, openSlots, onRefetch }: Props) {
  const dateStr = format(date, "yyyy-MM-dd");
  const [bookOpen, setBookOpen] = useState(false);
  const [prefill, setPrefill] = useState<any>(null);
  const [detail, setDetail] = useState<PrivateLessonBooking | null>(null);
  const [instructors, setInstructors] = useState<{ id: string; name: string }[]>([]);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<any | null>(null);
  const [rescheduleOccId, setRescheduleOccId] = useState<string | undefined>(undefined);
  const [quickEdit, setQuickEdit] = useState<QuickEditLesson | null>(null);

  useEffect(() => {
    supabase.rpc("get_active_instructors_public").then(({ data }) => {
      if (data) setInstructors((data as any[]).map((i) => ({ id: i.id, name: i.name })));
    });
  }, []);

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

  const swapInstructor = async (lesson: PrivateLessonBooking, instructorId: string) => {
    const inst = instructors.find((i) => i.id === instructorId);
    if (!inst) return;
    setSwapping(lesson.occurrence_id);
    try {
      const { error } = await supabase
        .from("lesson_booking_occurrences")
        .update({
          instructor_override_id: inst.id,
          instructor_override_name: inst.name,
        })
        .eq("id", lesson.occurrence_id);
      if (error) throw error;
      toast.success(`Moved to Coach ${inst.name} for ${format(date, "MMM d")}`);
      onRefetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to swap instructor");
    } finally {
      setSwapping(null);
    }
  };

  const openReschedule = async (lesson: PrivateLessonBooking) => {
    // Fetch the underlying booking + all its occurrences for the dialog
    const { data, error } = await supabase
      .from("lesson_bookings")
      .select("id, child_name, parent_name, instructor_id, instructor_name, start_time, end_time, lesson_booking_occurrences(id, occurrence_date, status, start_time_override, end_time_override, instructor_override_id, instructor_override_name)")
      .eq("id", lesson.booking_id)
      .maybeSingle();
    if (error || !data) {
      toast.error(error?.message || "Could not load booking");
      return;
    }
    setRescheduleBooking(data);
    setRescheduleOccId(lesson.occurrence_id);
  };

  return (
    <>
      <Card className="p-4 max-w-full overflow-x-hidden">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2 flex-wrap">
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
        {todays.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Booked</p>
            <div className="space-y-1.5">
              {todays.map((l) => (
                <div
                  key={l.occurrence_id}
                  className="flex items-center gap-2 p-2 rounded border border-border hover:bg-muted/40 transition-colors"
                >
                  <button
                    onClick={() => setDetail(l)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <div className="text-xs font-semibold text-foreground tabular-nums min-w-[80px]">
                      {fmtTime(l.start_time)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">
                        {l.child_name || l.parent_name}
                        {l.lesson_type === "semi_private" && <span className="ml-1 text-[10px] text-muted-foreground">(semi)</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {l.instructor_name || "Unassigned"}
                      </div>
                    </div>
                    {paymentBadge(l.payment_status)}
                  </button>
                  <Select
                    value={l.instructor_id || ""}
                    onValueChange={(v) => swapInstructor(l, v)}
                    disabled={swapping === l.occurrence_id}
                  >
                    <SelectTrigger className="h-7 w-[120px] text-[11px]" aria-label="Change instructor">
                      <SelectValue placeholder="Instructor" />
                    </SelectTrigger>
                    <SelectContent>
                      {instructors.map((i) => (
                        <SelectItem key={i.id} value={i.id} className="text-xs">{i.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setQuickEdit({
                      booking_id: l.booking_id,
                      occurrence_id: l.occurrence_id,
                      occurrence_date: l.occurrence_date,
                      start_time: l.start_time,
                      end_time: l.end_time,
                      instructor_id: l.instructor_id || null,
                      instructor_name: l.instructor_name || null,
                      child_name: l.child_name,
                      parent_name: l.parent_name,
                    })}
                  >
                    {swapping === l.occurrence_id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <CalendarCog className="w-3 h-3 mr-1" />
                        Edit
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Open slots */}
        {slots.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Open slots</p>
            <div className="space-y-1.5">
              {slotsByTime.map(([time, group]) => (
                <div key={time} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-muted-foreground tabular-nums min-w-[64px]">
                    {fmtTime(time)}
                  </span>
                  {group.map((s, i) => (
                    <button
                      key={`${s.instructor_id}-${i}`}
                      onClick={() => handleBookSlot(s)}
                      className="rounded border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-2 py-1 text-[10px] text-foreground transition-colors"
                      title={`Book ${s.instructor_name} at ${fmtTime(s.start_time)}`}
                    >
                      {s.instructor_name}
                    </button>
                  ))}
                  {group.length > 1 && (
                    <span className="text-[10px] text-muted-foreground">({group.length} coaches open)</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}


        {todays.length === 0 && slots.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No private lessons or open slots for this day.</p>
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
        lockedSlot={!!prefill?.start_time}
        onBooked={onRefetch}
      />
      <PrivateLessonDetailDialog
        lesson={detail}
        onClose={() => setDetail(null)}
        onChanged={onRefetch}
      />
      <ReschedulePrivateLessonDialog
        open={!!rescheduleBooking}
        onOpenChange={(o) => { if (!o) { setRescheduleBooking(null); setRescheduleOccId(undefined); } }}
        booking={rescheduleBooking}
        initialOccurrenceId={rescheduleOccId}
        initialMode="one"
        onDone={() => { setRescheduleBooking(null); setRescheduleOccId(undefined); onRefetch(); }}
      />
      <QuickEditLessonDialog
        open={!!quickEdit}
        onOpenChange={(o) => { if (!o) setQuickEdit(null); }}
        lesson={quickEdit}
        onSaved={() => { setQuickEdit(null); onRefetch(); }}
      />
    </>
  );
}
