import { useEffect, useMemo, useState } from "react";
import { format, addDays, addWeeks } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import InstructorPicker from "@/components/admin/calendar/InstructorPicker";
import { useAvailableSlots } from "@/hooks/useAvailableSlots";
import { getStripeEnvironment } from "@/lib/stripe";
import type { LessonRequest } from "@/components/admin/LessonRequestDetailDialog";

interface Props {
  request: LessonRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBooked: (updated: LessonRequest) => void;
}

const DAYS = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];

function generateOccurrences(
  start: Date,
  end: Date,
  days: string[],
  freq: "weekly" | "biweekly",
): Date[] {
  const dayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };
  const dayNums = days.map((d) => dayMap[d]).filter((n) => n !== undefined);
  const dates: Date[] = [];
  let cursor = new Date(start);
  let weekCount = 0;
  while (cursor <= end) {
    for (let i = 0; i < 7; i++) {
      const day = addDays(cursor, i);
      if (day > end) break;
      if (day < start) continue;
      if (dayNums.includes(day.getDay())) {
        if (freq === "weekly" || weekCount % 2 === 0) dates.push(new Date(day));
      }
    }
    cursor = addWeeks(cursor, 1);
    weekCount++;
  }
  return dates;
}

export default function BookFromRequestDialog({ request, open, onOpenChange, onBooked }: Props) {
  const { toast } = useToast();

  const isPrivate = request?.lesson_type !== "semi-private";
  const lessonType = isPrivate ? "private-lesson" : "semi-private-lesson";
  const lessonTypeLabel = isPrivate ? "Private Lesson" : "Semi-Private Lesson";
  const defaultLength = isPrivate ? 60 : 45;
  const defaultPrice = isPrivate ? 65 : 45;

  // Form state
  const [eventDate, setEventDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("17:00");
  const [poolArea, setPoolArea] = useState("shallow");
  const [instructorName, setInstructorName] = useState("");
  const [pricePerSession, setPricePerSession] = useState(defaultPrice);
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<"weekly" | "biweekly">("weekly");
  const [recurDays, setRecurDays] = useState<string[]>([]);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [sendPaymentLink, setSendPaymentLink] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset whenever the dialog opens with a fresh request.
  useEffect(() => {
    if (!open || !request) return;
    setEventDate(new Date());
    const startDefault = isPrivate ? "16:00" : "16:00";
    const [h, m] = startDefault.split(":").map(Number);
    const endH = h + Math.floor(defaultLength / 60);
    const endM = (m + (defaultLength % 60)) % 60;
    setStartTime(startDefault);
    setEndTime(`${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`);
    setPoolArea("shallow");
    setInstructorName("");
    setPricePerSession(defaultPrice);
    setRecurring(false);
    setFrequency("weekly");
    setRecurDays([]);
    setEndDate(null);
    setSendPaymentLink(true);
    setNotes(request.preferred_times ? `Preferred times: ${request.preferred_times}` : "");
  }, [open, request?.id]);

  const { slots, loading: slotsLoading, hasAnyShift } = useAvailableSlots(open ? eventDate : null, {
    lengthMin: defaultLength,
    poolArea,
  });

  const groupedSlots = useMemo(() => {
    const map = new Map<string, typeof slots>();
    for (const s of slots) {
      const arr = map.get(s.instructorName) || [];
      arr.push(s);
      map.set(s.instructorName, arr);
    }
    return Array.from(map.entries());
  }, [slots]);

  const applySlot = (slot: { instructorName: string; start: string; end: string }) => {
    setInstructorName(slot.instructorName);
    setStartTime(slot.start);
    setEndTime(slot.end);
  };

  const handleBook = async () => {
    if (!request) return;
    if (!startTime || !endTime) {
      toast({ title: "Pick a time", variant: "destructive" });
      return;
    }
    if (recurring && (recurDays.length === 0 || !endDate)) {
      toast({ title: "Pick recurring days and end date", variant: "destructive" });
      return;
    }

    setSaving(true);

    const eventDates = recurring && endDate
      ? generateOccurrences(eventDate, endDate, recurDays, frequency)
      : [eventDate];

    if (eventDates.length === 0) {
      toast({ title: "No occurrences fall within the range", variant: "destructive" });
      setSaving(false);
      return;
    }

    const lessonTypeShort = isPrivate ? "private" : "semi-private";
    const childName = request.child_name?.trim() || "";
    const parentName = request.parent_name?.trim() || "";

    // 1. lesson_bookings row
    const { data: bookingRow, error: bookingErr } = await supabase
      .from("lesson_bookings")
      .insert({
        lesson_type: lessonTypeShort,
        parent_name: parentName,
        parent_email: request.parent_email,
        parent_phone: request.parent_phone || null,
        child_name: childName || null,
        price_per_session: pricePerSession,
        instructor_name: instructorName.trim() || null,
        pool_area: poolArea,
        start_time: startTime,
        end_time: endTime,
        recurring,
        frequency: recurring ? frequency : null,
        recur_days: recurring ? recurDays : [],
        series_start: format(eventDates[0], "yyyy-MM-dd"),
        series_end: format(eventDates[eventDates.length - 1], "yyyy-MM-dd"),
        notes: notes.trim() || null,
        waiver_token: crypto.randomUUID().replace(/-/g, ""),
      } as any)
      .select("id")
      .single();

    if (bookingErr || !bookingRow) {
      toast({ title: "Failed to create booking", description: bookingErr?.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // 2. pool_events
    const titleStr = `${lessonTypeLabel} — ${childName || parentName}`;
    const poolEventRows = eventDates.map((d) => ({
      event_type: lessonType,
      title: titleStr,
      event_date: format(d, "yyyy-MM-dd"),
      start_time: startTime,
      end_time: endTime,
      pool_area: poolArea,
      instructor_name: instructorName.trim() || null,
      client_name: childName || parentName || null,
      notes: notes.trim() || null,
      is_recurring: recurring,
    }));
    const { data: insertedEvents, error: peErr } = await supabase
      .from("pool_events")
      .insert(poolEventRows as any)
      .select("id, event_date");

    if (peErr || !insertedEvents) {
      toast({ title: "Calendar events failed", description: peErr?.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // 3. occurrences
    const occurrenceRows = insertedEvents.map((ev) => ({
      booking_id: bookingRow.id,
      pool_event_id: ev.id,
      occurrence_date: ev.event_date,
      payment_status: "unpaid",
    }));
    const { data: insertedOccs, error: occErr } = await supabase
      .from("lesson_booking_occurrences")
      .insert(occurrenceRows as any)
      .select("id, occurrence_date")
      .order("occurrence_date", { ascending: true });

    if (occErr || !insertedOccs) {
      toast({ title: "Occurrences failed", description: occErr?.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // 4. confirmation email + payment link
    //    - 1 lesson: single-occurrence wrapper builds one Stripe link.
    //    - 2+ lessons: series wrapper builds one combined Stripe link
    //      covering the whole series so the parent doesn't get multiple
    //      payment emails.
    if (sendPaymentLink && insertedOccs.length > 0) {
      try {
        const fnName = insertedOccs.length > 1
          ? "send-lesson-series-confirmation"
          : "send-lesson-booking-confirmation";
        const body = insertedOccs.length > 1
          ? { bookingId: bookingRow.id, environment: getStripeEnvironment(), siteUrl: window.location.origin }
          : { occurrenceId: insertedOccs[0].id, environment: getStripeEnvironment(), siteUrl: window.location.origin };
        const { error: sendErr } = await supabase.functions.invoke(fnName, { body });
        if (sendErr) throw sendErr;
      } catch (e: any) {
        toast({
          title: "Booked, but confirmation email failed",
          description: e?.message || "You can resend from the calendar.",
          variant: "destructive",
        });
      }
    }

    // 5. flip lesson request to scheduled
    const nowIso = new Date().toISOString();
    await supabase
      .from("lesson_requests")
      .update({ status: "scheduled", updated_at: nowIso })
      .eq("id", request.id);

    onBooked({ ...request, status: "scheduled" });

    toast({
      title: sendPaymentLink ? "Booked & email sent" : "Lesson booked",
      description: `${insertedOccs.length} occurrence${insertedOccs.length > 1 ? "s" : ""} added to the calendar`,
    });

    setSaving(false);
    onOpenChange(false);
  };

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Book Lesson — {request.child_name}
            <Badge variant="outline" className={isPrivate ? "bg-purple-50 text-purple-700 border-purple-300" : "bg-blue-50 text-blue-700 border-blue-300"}>
              {isPrivate ? "Private" : "Semi-Private"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Locked client info */}
          <div className="rounded-md bg-muted/40 border p-2 text-xs space-y-0.5">
            <div><span className="text-muted-foreground">Parent:</span> <span className="font-medium">{request.parent_name}</span> · {request.parent_email}</div>
            {request.parent_phone && <div className="text-muted-foreground">{request.parent_phone}</div>}
            {request.preferred_times && (
              <div className="mt-1 pt-1 border-t border-border/50"><span className="text-muted-foreground">Prefers:</span> {request.preferred_times}</div>
            )}
          </div>

          {/* Date */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start text-xs h-9">
                  <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                  {format(eventDate, "EEE, MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[60]" align="start">
                <Calendar
                  mode="single"
                  selected={eventDate}
                  onSelect={(d) => d && setEventDate(d)}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Suggested slots */}
          <div className="rounded-md border bg-card p-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Suggested open slots ({defaultLength} min)
            </div>
            {slotsLoading ? (
              <div className="text-xs text-muted-foreground">Checking schedule…</div>
            ) : !hasAnyShift ? (
              <div className="text-xs text-muted-foreground">
                No instructors are scheduled for this date. Use Manual entry below to assign one.
              </div>
            ) : slots.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                Instructors are working but every slot conflicts with an existing booking. Try another date or use Manual entry.
              </div>
            ) : (
              <div className="space-y-2">
                {groupedSlots.map(([name, list]) => (
                  <div key={name}>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">{name}</div>
                    <div className="flex flex-wrap gap-1">
                      {list.map((s) => {
                        const active = s.instructorName === instructorName && s.start === startTime && s.end === endTime;
                        return (
                          <button
                            key={`${s.instructorId}-${s.start}`}
                            type="button"
                            onClick={() => applySlot(s)}
                            className={cn(
                              "px-2 py-1 rounded text-[11px] font-medium border transition-colors",
                              active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted/40 text-foreground border-border hover:bg-muted",
                            )}
                          >
                            {s.start}–{s.end}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manual override */}
          <div className="rounded-md border p-2.5 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
              Manual entry / override
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Instructor</Label>
              <InstructorPicker value={instructorName} onChange={setInstructorName} refreshKey={open} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Start</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">End</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Pool area</Label>
                <Select value={poolArea} onValueChange={setPoolArea}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shallow" className="text-xs">Shallow</SelectItem>
                    <SelectItem value="deep" className="text-xs">Deep</SelectItem>
                    <SelectItem value="full" className="text-xs">Full pool</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Price */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Price per session ($)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={pricePerSession}
              onChange={(e) => setPricePerSession(parseFloat(e.target.value) || 0)}
              className="h-8 text-xs"
            />
          </div>

          {/* Recurring */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="book-recurring"
                checked={recurring}
                onCheckedChange={(c) => setRecurring(!!c)}
              />
              <Label htmlFor="book-recurring" className="text-xs cursor-pointer">Recurring series</Label>
            </div>
            {recurring && (
              <div className="space-y-2 pl-1 border-l-2 border-primary/20 ml-1">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Frequency</Label>
                    <Select value={frequency} onValueChange={(v) => setFrequency(v as "weekly" | "biweekly")}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                        <SelectItem value="biweekly" className="text-xs">Biweekly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">End date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-start text-xs h-8">
                          <CalendarIcon className="w-3 h-3 mr-1.5" />
                          {endDate ? format(endDate, "MMM d") : "Pick"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[60]" align="start">
                        <Calendar
                          mode="single"
                          selected={endDate ?? undefined}
                          onSelect={(d) => setEndDate(d ?? null)}
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Days</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((day) => {
                      const active = recurDays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => setRecurDays(active ? recurDays.filter((d) => d !== day.value) : [...recurDays, day.value])}
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium border transition-colors",
                            active ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                          )}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Send confirmation */}
          <div className="flex items-start gap-2 rounded-md bg-muted/40 p-2 border">
            <Checkbox
              id="book-send-link"
              checked={sendPaymentLink}
              onCheckedChange={(c) => setSendPaymentLink(!!c)}
              className="mt-0.5"
            />
            <Label htmlFor="book-send-link" className="text-xs cursor-pointer leading-snug">
              Email parent a confirmation + Stripe payment link for the first lesson
              {recurring && " (subsequent lessons get links 24h before each)"}
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleBook} disabled={saving}>
            {saving ? "Booking…" : "Book Lesson"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
