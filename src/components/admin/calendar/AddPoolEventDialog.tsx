import { useState, useEffect } from "react";
import { format, addDays, addWeeks } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { LEVEL_DISPLAY, type SwimLevel } from "@/components/swim-enrollment/types";
import SwimLessonFields from "./SwimLessonFields";
import LessonBookingFields, { type LessonBookingFieldsData } from "./LessonBookingFields";
import { getStripeEnvironment } from "@/lib/stripe";
import type { SwimLessonData } from "./SwimLessonFields";
import type { CalendarPoolEvent } from "@/hooks/useCalendarData";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: Date;
  onSaved: () => void;
  editEvent?: CalendarPoolEvent | null;
  prefillStartTime?: string | null;
}

const EVENT_TYPES = [
  { value: "i-can-swim", label: "I Can Swim" },
  { value: "swim-lesson", label: "Swim Lesson" },
  { value: "private-lesson", label: "Private" },
  { value: "semi-private-lesson", label: "Semi-Private" },
  { value: "dive-session", label: "Dive" },
  { value: "pool-rental", label: "Rental" },
  { value: "maintenance", label: "Maintenance" },
  { value: "other", label: "Other" },
];

const defaultSwimLessonData = (): SwimLessonData => ({
  swimLevel: "white" as SwimLevel,
  maxStudents: 3,
  recurring: false,
  frequency: "weekly",
  recurDays: [],
  endDate: null,
  swimmers: [],
});

const defaultLessonBookingData = (lessonType: string): LessonBookingFieldsData => ({
  parentName: "",
  parentEmail: "",
  parentPhone: "",
  childName: "",
  pricePerSession: lessonType === "private-lesson" ? 65 : 45,
  recurring: false,
  frequency: "weekly",
  recurDays: [],
  endDate: null,
  sendPaymentLink: true,
});

const AddPoolEventDialog = ({ open, onOpenChange, defaultDate, onSaved, editEvent, prefillStartTime }: Props) => {
  const [eventType, setEventType] = useState("i-can-swim");
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState<Date>(defaultDate);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("10:00");
  const [poolArea, setPoolArea] = useState("shallow");
  const [instructorName, setInstructorName] = useState("");
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [swimLessonData, setSwimLessonData] = useState<SwimLessonData>(defaultSwimLessonData());
  const [lessonBookingData, setLessonBookingData] = useState<LessonBookingFieldsData>(defaultLessonBookingData("private-lesson"));
  const { toast } = useToast();

  const isEditing = !!editEvent;
  const isLessonBooking = eventType === "private-lesson" || eventType === "semi-private-lesson";

  useEffect(() => {
    if (editEvent) {
      setEventType(editEvent.event_type);
      setTitle(editEvent.title);
      setEventDate(new Date(editEvent.event_date + "T00:00:00"));
      setStartTime(editEvent.start_time.slice(0, 5));
      setEndTime(editEvent.end_time.slice(0, 5));
      setPoolArea(editEvent.pool_area);
      setInstructorName(editEvent.instructor_name || "");
      setNotes(editEvent.notes || "");
    } else {
      resetForm();
      if (prefillStartTime) {
        setStartTime(prefillStartTime);
        const [h, m] = prefillStartTime.split(":").map(Number);
        const endH = Math.min(h + 1, 20);
        setEndTime(`${endH.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
      }
    }
  }, [editEvent, open, prefillStartTime]);

  const resetForm = () => {
    setEventType("i-can-swim");
    setTitle("");
    setEventDate(defaultDate);
    setStartTime("08:00");
    setEndTime("10:00");
    setPoolArea("shallow");
    setInstructorName("");
    setClientName("");
    setNotes("");
    setSwimLessonData(defaultSwimLessonData());
    setLessonBookingData(defaultLessonBookingData("private-lesson"));
  };

  const handleTypeChange = (type: string) => {
    setEventType(type);
    if (type === "i-can-swim") {
      setTitle("I Can Swim 209"); setPoolArea("shallow");
    } else if (type === "swim-lesson") {
      setTitle("Swim Lesson"); setPoolArea("shallow");
    } else if (type === "private-lesson") {
      setTitle("Private Lesson"); setPoolArea("shallow");
      setLessonBookingData((prev) => ({ ...prev, pricePerSession: 65 }));
    } else if (type === "semi-private-lesson") {
      setTitle("Semi-Private Lesson"); setPoolArea("shallow");
      setLessonBookingData((prev) => ({ ...prev, pricePerSession: 45 }));
    } else if (type === "dive-session") {
      setTitle("Dive Training"); setPoolArea("deep");
    } else if (type === "pool-rental") {
      setTitle(""); setPoolArea("full");
    } else if (type === "maintenance") {
      setTitle("Pool Maintenance"); setPoolArea("full");
    } else {
      setTitle(""); setPoolArea("full");
    }
  };

  const generateOccurrences = (start: Date, end: Date, days: string[], freq: "weekly" | "biweekly"): Date[] => {
    const dates: Date[] = [];
    const dayMap: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    };
    const dayNums = days.map((d) => dayMap[d]).filter((n) => n !== undefined);
    let cursor = new Date(start);
    let weekCount = 0;

    while (cursor <= end) {
      const weekStart = new Date(cursor);
      for (let i = 0; i < 7; i++) {
        const day = addDays(weekStart, i);
        if (day > end) break;
        if (day < start) continue;
        if (dayNums.includes(day.getDay())) {
          if (freq === "weekly" || weekCount % 2 === 0) {
            dates.push(new Date(day));
          }
        }
      }
      cursor = addWeeks(cursor, 1);
      weekCount++;
    }
    return dates;
  };

  const handleSave = async () => {
    const effectiveTitle = eventType === "swim-lesson"
      ? (LEVEL_DISPLAY[swimLessonData.swimLevel]?.groupName || "Swim Lesson")
      : title;

    if (!effectiveTitle.trim() && eventType !== "swim-lesson") {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    setSaving(true);

    if (eventType === "swim-lesson") {
      await handleSwimLessonSave(effectiveTitle);
    } else if (isLessonBooking && !isEditing) {
      await handleLessonBookingSave(effectiveTitle);
    } else {
      await handleRegularSave(effectiveTitle);
    }

    setSaving(false);
  };

  const handleRegularSave = async (effectiveTitle: string) => {
    const payload: Record<string, unknown> = {
      event_type: eventType,
      title: effectiveTitle.trim(),
      event_date: format(eventDate, "yyyy-MM-dd"),
      start_time: startTime,
      end_time: endTime,
      pool_area: poolArea,
      instructor_name: instructorName.trim() || null,
      client_name: clientName.trim() || null,
      notes: notes.trim() || null,
    };

    const { error } = isEditing
      ? await supabase.from("pool_events").update(payload as any).eq("id", editEvent!.id)
      : await supabase.from("pool_events").insert(payload as any);

    if (error) {
      toast({ title: "Failed to save event", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: isEditing ? "Event updated" : "Event added" });
    onOpenChange(false);
    resetForm();
    onSaved();
  };

  const handleLessonBookingSave = async (effectiveTitle: string) => {
    const lb = lessonBookingData;
    if (!lb.parentName.trim() || !lb.parentEmail.trim()) {
      toast({ title: "Parent name & email required", variant: "destructive" });
      return;
    }
    if (lb.recurring && (lb.recurDays.length === 0 || !lb.endDate)) {
      toast({ title: "Pick recurring days and end date", variant: "destructive" });
      return;
    }

    // 1. Build occurrence dates
    const eventDates: Date[] = lb.recurring && lb.endDate
      ? generateOccurrences(eventDate, lb.endDate, lb.recurDays, lb.frequency)
      : [eventDate];

    if (eventDates.length === 0) {
      toast({ title: "No occurrences fall within the selected range", variant: "destructive" });
      return;
    }

    const lessonType = eventType === "private-lesson" ? "private" : "semi-private";
    const lessonTypeLabel = lessonType === "private" ? "Private Lesson" : "Semi-Private Lesson";

    // 2. Insert booking row
    const { data: bookingRow, error: bookingErr } = await supabase
      .from("lesson_bookings")
      .insert({
        lesson_type: lessonType,
        parent_name: lb.parentName.trim(),
        parent_email: lb.parentEmail.trim(),
        parent_phone: lb.parentPhone.trim() || null,
        child_name: lb.childName.trim() || null,
        price_per_session: lb.pricePerSession,
        instructor_name: instructorName.trim() || null,
        pool_area: poolArea,
        start_time: startTime,
        end_time: endTime,
        recurring: lb.recurring,
        frequency: lb.recurring ? lb.frequency : null,
        recur_days: lb.recurring ? lb.recurDays : [],
        series_start: format(eventDates[0], "yyyy-MM-dd"),
        series_end: format(eventDates[eventDates.length - 1], "yyyy-MM-dd"),
        notes: notes.trim() || null,
        waiver_token: crypto.randomUUID().replace(/-/g, ""),
      } as any)
      .select("id")
      .single();

    if (bookingErr || !bookingRow) {
      toast({ title: "Failed to create booking", description: bookingErr?.message, variant: "destructive" });
      return;
    }

    // 3. Insert pool_events rows
    const titleStr = `${lessonTypeLabel} — ${(lb.childName || lb.parentName).trim()}`.trim();
    const poolEventRows = eventDates.map((d) => ({
      event_type: eventType,
      title: titleStr,
      event_date: format(d, "yyyy-MM-dd"),
      start_time: startTime,
      end_time: endTime,
      pool_area: poolArea,
      instructor_name: instructorName.trim() || null,
      client_name: (lb.childName || lb.parentName).trim() || null,
      notes: notes.trim() || null,
      is_recurring: lb.recurring,
    }));
    const { data: insertedEvents, error: peErr } = await supabase
      .from("pool_events")
      .insert(poolEventRows as any)
      .select("id, event_date");

    if (peErr || !insertedEvents) {
      toast({ title: "Calendar events failed", description: peErr?.message, variant: "destructive" });
      return;
    }

    // 4. Insert occurrences linking each pool_event
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
      return;
    }

    // 5. Send confirmation + payment link for FIRST occurrence only
    if (lb.sendPaymentLink && insertedOccs.length > 0) {
      const firstOcc = insertedOccs[0];
      try {
        const { error: sendErr } = await supabase.functions.invoke("send-lesson-booking-confirmation", {
          body: {
            occurrenceId: firstOcc.id,
            environment: getStripeEnvironment(),
            siteUrl: window.location.origin,
          },
        });
        if (sendErr) throw sendErr;
      } catch (e: any) {
        toast({
          title: "Booking saved, but confirmation email failed",
          description: e?.message || "You can resend from the calendar block.",
          variant: "destructive",
        });
      }
    }

    toast({
      title: lb.sendPaymentLink ? "Lesson booked & email sent" : "Lesson booked",
      description: `${insertedOccs.length} occurrence${insertedOccs.length > 1 ? "s" : ""} created`,
    });
    onOpenChange(false);
    resetForm();
    onSaved();
  };

  const handleSwimLessonSave = async (effectiveTitle: string) => {
    const { swimLevel, maxStudents, recurring, frequency, recurDays, endDate, swimmers } = swimLessonData;

    let dayOfWeek: string;
    if (recurring && recurDays.length > 0) {
      dayOfWeek = recurDays.join("_");
    } else {
      dayOfWeek = format(eventDate, "EEEE").toLowerCase();
    }

    const sessionStartDate = format(eventDate, "yyyy-MM-dd");
    const sessionEndDate = recurring && endDate
      ? format(endDate, "yyyy-MM-dd")
      : sessionStartDate;

    const { data: sessionData, error: sessionError } = await supabase
      .from("swim_sessions")
      .insert({
        swim_level: swimLevel,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        max_students: maxStudents,
        session_name: effectiveTitle,
        session_start_date: sessionStartDate,
        session_end_date: sessionEndDate,
        is_active: true,
      } as any)
      .select("id")
      .single();

    if (sessionError || !sessionData) {
      toast({ title: "Failed to create session", description: sessionError?.message, variant: "destructive" });
      return;
    }

    let eventDates: Date[];
    if (recurring && recurDays.length > 0 && endDate) {
      eventDates = generateOccurrences(eventDate, endDate, recurDays, frequency);
    } else {
      eventDates = [eventDate];
    }

    const poolEventRows = eventDates.map((d) => ({
      event_type: "swim-lesson",
      title: effectiveTitle,
      event_date: format(d, "yyyy-MM-dd"),
      start_time: startTime,
      end_time: endTime,
      pool_area: "shallow",
      instructor_name: instructorName.trim() || null,
      notes: notes.trim() || null,
      is_recurring: recurring,
    }));

    const { error: eventError } = await supabase.from("pool_events").insert(poolEventRows as any);
    if (eventError) {
      toast({ title: "Events created partially", description: eventError.message, variant: "destructive" });
    }

    const validSwimmers = swimmers.filter((s) => s.childName && s.childAge && s.parentName && s.parentEmail);
    if (validSwimmers.length > 0) {
      const enrollRows = validSwimmers.map((s) => ({
        child_name: s.childName.trim(),
        child_age: parseInt(s.childAge),
        parent_name: s.parentName.trim(),
        parent_email: s.parentEmail.trim(),
        parent_phone: s.parentPhone.trim() || null,
        swim_level: swimLevel,
        session_id: sessionData.id,
        status: "confirmed",
      }));
      const { error: enrollError } = await supabase.from("swim_enrollments").insert(enrollRows as any);
      if (enrollError) {
        toast({ title: "Swimmers enrollment failed", description: enrollError.message, variant: "destructive" });
      }
    }

    toast({
      title: "Swim lesson created",
      description: `${eventDates.length} occurrence${eventDates.length > 1 ? "s" : ""} with ${validSwimmers.length} swimmer${validSwimmers.length !== 1 ? "s" : ""}`,
    });
    onOpenChange(false);
    resetForm();
    onSaved();
  };

  const showInstructor = ["dive-session", "i-can-swim", "private-lesson", "semi-private-lesson", "swim-lesson"].includes(eventType);
  const showLegacyClient = ["pool-rental", "dive-session"].includes(eventType);
  const showTitle = eventType === "pool-rental" || eventType === "other";
  const isSwimLesson = eventType === "swim-lesson";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-4 gap-3 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-0">
          <DialogTitle className="text-base">{isEditing ? "Edit Event" : "New Event"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            {EVENT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => handleTypeChange(t.value)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  eventType === t.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {showTitle && (
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event name" className="h-8 text-sm" />
          )}

          <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">{isLessonBooking && lessonBookingData.recurring ? "First date" : "Date"}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-xs h-8">
                    <CalendarIcon className="w-3 h-3 mr-1.5" />
                    {format(eventDate, "MMM d")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={eventDate}
                    onSelect={(d) => d && setEventDate(d)}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Start</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-8 text-xs w-[100px]" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">End</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-8 text-xs w-[100px]" />
            </div>
          </div>

          {isSwimLesson && (
            <SwimLessonFields data={swimLessonData} onChange={setSwimLessonData} />
          )}

          {isLessonBooking && !isEditing && (
            <LessonBookingFields
              lessonType={eventType as "private-lesson" | "semi-private-lesson"}
              data={lessonBookingData}
              onChange={setLessonBookingData}
            />
          )}

          {showLegacyClient && (
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name" className="h-8 text-sm" />
          )}

          {showInstructor && (
            <Input value={instructorName} onChange={(e) => setInstructorName(e.target.value)} placeholder="Instructor (optional)" className="h-8 text-sm" />
          )}

          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="h-8 text-sm"
          />

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : isEditing ? "Update" : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddPoolEventDialog;
