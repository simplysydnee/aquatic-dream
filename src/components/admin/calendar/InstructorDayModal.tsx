import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, X, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import CancelLessonDialog from "./CancelLessonDialog";
import ReassignDialog from "./ReassignDialog";
import type { CancelTarget } from "@/lib/lessonCancel";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  instructorName: string;
  initialDate: Date;
  onChanged?: () => void;
}

interface Row {
  id: string;
  kind: "session_date" | "lesson_occurrence";
  title: string;
  subtitle: string;
  timeLabel: string;
  cancelled: boolean;
  cancelTarget: CancelTarget;
  /** for reassign mapping */
  sessionDateId?: string;
  poolEventId?: string;
  /** for reassign notify */
  notify?: {
    date: string;
    timeLabel?: string;
    swimmer: { parentName: string; parentEmail: string; childName: string };
  };
}

function fmtT(t: string) {
  return format(new Date(`2000-01-01T${t}`), "h:mm a");
}

const InstructorDayModal = ({ open, onOpenChange, instructorName, initialDate, onChanged }: Props) => {
  const [date, setDate] = useState<Date>(initialDate);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);

  useEffect(() => {
    if (open) setDate(initialDate);
  }, [open, initialDate]);

  const dateStr = format(date, "yyyy-MM-dd");
  const dayName = format(date, "EEEE");

  const load = async () => {
    setLoading(true);
    setSelected(new Set());

    // Group sessions for this instructor on this day
    const [sessRes, datesRes, instructorRes] = await Promise.all([
      supabase
        .from("swim_sessions")
        .select("id, swim_level, session_name, day_of_week, start_time, end_time, instructor_id, instructors(name)")
        .eq("is_active", true),
      supabase
        .from("session_lesson_dates")
        .select("id, session_id, lesson_date, is_cancelled, instructor_override_id")
        .eq("lesson_date", dateStr),
      supabase
        .from("instructors")
        .select("id, name")
        .eq("name", instructorName)
        .maybeSingle(),
    ]);

    const instructorId = instructorRes.data?.id;
    const datesByDate = (datesRes.data || []).filter((d) => d.lesson_date === dateStr);

    // Sessions belonging to this instructor (either base or overridden) that have a non-cancelled date today
    const sessionRows: Row[] = [];
    for (const d of datesByDate) {
      const sess = (sessRes.data || []).find((s) => s.id === d.session_id);
      if (!sess) continue;
      if (!sess.day_of_week.toLowerCase().includes(dayName.toLowerCase())) continue;
      const effectiveInstructorId = d.instructor_override_id || sess.instructor_id;
      if (instructorId && effectiveInstructorId !== instructorId) continue;
      if (!instructorId && sess.instructors?.name !== instructorName) continue;

      // Roster for credit preview
      const { data: rosterRaw } = await supabase
        .from("swim_enrollments")
        .select("child_name, parent_name, parent_email, payment_status, payment_amount, session_fee_status")
        .eq("session_id", sess.id)
        .in("status", ["pending", "confirmed"]);

      const swimmers = (rosterRaw || []).map((e) => ({
        parentName: e.parent_name,
        parentEmail: e.parent_email,
        childName: e.child_name,
        paidAmount:
          e.payment_status === "paid" || e.session_fee_status === "paid"
            ? Number(e.payment_amount || 0)
            : 0,
      }));

      const timeLabel = `${fmtT(sess.start_time)} – ${fmtT(sess.end_time)}`;
      sessionRows.push({
        id: `sd-${d.id}`,
        kind: "session_date",
        title: sess.session_name || sess.swim_level,
        subtitle: `Group · ${swimmers.length} swimmer${swimmers.length !== 1 ? "s" : ""}`,
        timeLabel,
        cancelled: !!d.is_cancelled,
        sessionDateId: d.id,
        cancelTarget: {
          kind: "session_date",
          id: d.id,
          title: sess.session_name || sess.swim_level,
          date: dateStr,
          timeLabel,
          swimmers,
        },
      });
    }

    // Private/semi-private lesson occurrences
    const { data: occs } = await supabase
      .from("lesson_booking_occurrences")
      .select("id, occurrence_date, status, payment_status, booking_id")
      .eq("occurrence_date", dateStr);

    const bookingIds = [...new Set((occs || []).map((o) => o.booking_id))];
    let bookingsById: Record<string, any> = {};
    if (bookingIds.length) {
      const { data: bks } = await supabase
        .from("lesson_bookings")
        .select("id, lesson_type, instructor_name, parent_name, parent_email, child_name, start_time, end_time, price_per_session")
        .in("id", bookingIds);
      bookingsById = Object.fromEntries((bks || []).map((b) => [b.id, b]));
    }

    const privRows: Row[] = (occs || [])
      .map((o) => ({ o, b: bookingsById[o.booking_id] }))
      .filter(({ b }) => b && b.instructor_name === instructorName)
      .map(({ o, b }) => {
        const timeLabel = `${fmtT(b.start_time)} – ${fmtT(b.end_time)}`;
        const paid = o.payment_status === "paid" ? Number(b.price_per_session || 0) : 0;
        const swimmer = {
          parentName: b.parent_name,
          parentEmail: b.parent_email,
          childName: b.child_name || b.parent_name,
        };
        return {
          id: `lo-${o.id}`,
          kind: "lesson_occurrence",
          title: b.child_name || b.parent_name,
          subtitle: b.lesson_type === "semi-private" ? "Semi-private" : "Private",
          timeLabel,
          cancelled: o.status === "cancelled",
          cancelTarget: {
            kind: "lesson_occurrence",
            id: o.id,
            title: `${b.lesson_type === "semi-private" ? "Semi-private" : "Private"} — ${b.child_name || b.parent_name}`,
            date: dateStr,
            timeLabel,
            swimmers: [{ ...swimmer, paidAmount: paid }],
          },
          notify: { date: dateStr, timeLabel, swimmer },
        } as Row;
      });

    const all = [...sessionRows, ...privRows].sort((a, b) =>
      a.timeLabel.localeCompare(b.timeLabel)
    );
    setRows(all);
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dateStr, instructorName]);

  const selectableIds = useMemo(
    () => rows.filter((r) => !r.cancelled).map((r) => r.id),
    [rows]
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const selectedRows = rows.filter((r) => selected.has(r.id));

  const cancelTargets = selectedRows.map((r) => r.cancelTarget);
  const reassignSessionDateIds = selectedRows
    .filter((r) => r.kind === "session_date")
    .map((r) => r.sessionDateId!)
    .filter(Boolean);
  const hasUnreassignable = selectedRows.some((r) => r.kind !== "session_date");
  const canReassign = selectedRows.length > 0 && !hasUnreassignable;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span>{instructorName}'s schedule</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="font-normal">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {format(date, "EEE, MMM d")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <CalendarPicker
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between border-y py-2 -mx-6 px-6 bg-muted/30">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => {
                  setSelected(v ? new Set(selectableIds) : new Set());
                }}
                disabled={selectableIds.length === 0}
              />
              <span>
                {selected.size > 0
                  ? `${selected.size} selected`
                  : `Select all (${selectableIds.length})`}
              </span>
            </label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!canReassign}
                title={hasUnreassignable ? "Private/semi-private reassignment isn't supported here yet — pick group classes only" : undefined}
                onClick={() => setReassignOpen(true)}
              >
                Reassign
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={selected.size === 0}
                onClick={() => setCancelOpen(true)}
              >
                Cancel selected
              </Button>
            </div>
          </div>

          <div className="max-h-[55vh] overflow-y-auto -mx-6 px-6">
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nothing scheduled for {instructorName} on {format(date, "EEE, MMM d")}.
              </p>
            ) : (
              <ul className="divide-y">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className={cn(
                      "flex items-center gap-3 py-2.5",
                      r.cancelled && "opacity-50"
                    )}
                  >
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggle(r.id)}
                      disabled={r.cancelled}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{r.title}</p>
                        {r.cancelled && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            <Lock className="w-3 h-3" /> Cancelled
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.timeLabel} · {r.subtitle}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              <X className="w-4 h-4 mr-1" /> Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CancelLessonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        targets={cancelTargets}
        onDone={() => {
          load();
          onChanged?.();
        }}
      />

      <ReassignDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        sessionDateIds={reassignSessionDateIds}
        poolEventIds={reassignPoolEventIds}
        notifyMeta={reassignNotifyMeta}
        onDone={() => {
          load();
          onChanged?.();
        }}
      />
    </>
  );
};

export default InstructorDayModal;
