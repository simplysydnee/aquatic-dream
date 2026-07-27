import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEAD_STATUSES, DEAD_STATUS_FILTER } from "@/lib/lessonBookingStatus";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate: Date;
}

interface Instructor {
  id: string;
  name: string;
}

export default function PrintDayScheduleDialog({ open, onOpenChange, defaultDate }: Props) {
  const [date, setDate] = useState(format(defaultDate, "yyyy-MM-dd"));
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scheduledIds, setScheduledIds] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setDate(format(defaultDate, "yyyy-MM-dd"));
  }, [defaultDate, open]);

  // Load active instructors when dialog opens
  useEffect(() => {
    if (!open) return;
    supabase
      .from("instructors")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        if (data) setInstructors(data as Instructor[]);
      });
  }, [open]);

  // Compute scheduled instructors for the selected date and default-select them
  useEffect(() => {
    if (!open || !date) return;
    let cancelled = false;
    (async () => {
      const dayName = format(new Date(date + "T12:00:00"), "EEEE").toLowerCase();
      const [sessRes, datesRes, occRes] = await Promise.all([
        supabase
          .from("swim_sessions")
          .select("id, day_of_week, instructor_id, is_active")
          .eq("is_active", true),
        supabase
          .from("session_lesson_dates")
          .select("session_id, is_cancelled")
          .eq("lesson_date", date),
        supabase
          .from("lesson_booking_occurrences")
          .select("status, instructor_override_id, lesson_bookings!inner(instructor_id, status)")
          .eq("occurrence_date", date)
          .not("status", "in", DEAD_STATUS_FILTER),
      ]);

      if (cancelled) return;

      const activeSessionIds = new Set(
        (datesRes.data || [])
          .filter((d: any) => !d.is_cancelled)
          .map((d: any) => d.session_id),
      );
      const ids = new Set<string>();
      for (const s of (sessRes.data || []) as any[]) {
        if (
          s.instructor_id &&
          activeSessionIds.has(s.id) &&
          (s.day_of_week || "").toLowerCase().includes(dayName)
        ) {
          ids.add(s.instructor_id);
        }
      }
      for (const o of (occRes.data || []) as any[]) {
        const b = o.lesson_bookings;
        if (b && DEAD_STATUSES.includes(b.status)) continue;
        const iid = o.instructor_override_id || b?.instructor_id;
        if (iid) ids.add(iid);
      }
      setScheduledIds(ids);
      setSelectedIds(new Set(ids));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, date]);

  const allInstructorIds = useMemo(() => instructors.map((i) => i.id), [instructors]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const triggerLabel = useMemo(() => {
    if (selectedIds.size === 0) return "No instructors selected";
    if (instructors.length > 0 && selectedIds.size === instructors.length) {
      return `All instructors (${selectedIds.size})`;
    }
    if (selectedIds.size === 1) {
      const id = [...selectedIds][0];
      return instructors.find((i) => i.id === id)?.name || "1 instructor";
    }
    return `${selectedIds.size} instructors`;
  }, [selectedIds, instructors]);

  const handlePrint = () => {
    let param: string;
    if (instructors.length > 0 && selectedIds.size === instructors.length) {
      param = "all";
    } else {
      param = [...selectedIds].join(",");
    }
    const url = `/admin/print-day-schedule?date=${date}&instructor=${encodeURIComponent(param)}`;
    window.open(url, "_blank");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-4 h-4" /> Print Daily Schedule
          </DialogTitle>
          <DialogDescription>
            Roster + parent &amp; emergency contact info. Defaults to instructors scheduled on the selected date.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Instructors</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={pickerOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">{triggerLabel}</span>
                  <ChevronsUpDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[60]" align="start">
                <div className="flex gap-1 p-2 border-b">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setSelectedIds(new Set(allInstructorIds))}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setSelectedIds(new Set(scheduledIds))}
                  >
                    Reset to scheduled
                  </Button>
                </div>
                <Command>
                  <CommandInput placeholder="Search instructor…" className="text-xs h-8" />
                  <CommandList>
                    <CommandEmpty>No instructors found.</CommandEmpty>
                    <CommandGroup>
                      {instructors.map((inst) => {
                        const isSelected = selectedIds.has(inst.id);
                        const isScheduled = scheduledIds.has(inst.id);
                        return (
                          <CommandItem
                            key={inst.id}
                            value={inst.name}
                            onSelect={() => toggle(inst.id)}
                            className="text-xs"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-3.5 w-3.5",
                                isSelected ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="flex-1 truncate">{inst.name}</span>
                            {isScheduled && (
                              <span className="ml-2 text-[10px] text-muted-foreground">
                                scheduled
                              </span>
                            )}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <Button
            onClick={handlePrint}
            className="w-full gap-2"
            disabled={selectedIds.size === 0}
          >
            <Printer className="w-4 h-4" /> Open Print View
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
