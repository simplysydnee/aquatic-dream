import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { CalendarPoolEvent } from "@/hooks/useCalendarData";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: Date;
  onSaved: () => void;
  editEvent?: CalendarPoolEvent | null;
  prefillStartTime?: string | null;
}

const AddPoolEventDialog = ({ open, onOpenChange, defaultDate, onSaved, editEvent, prefillStartTime }: Props) => {
  const [eventType, setEventType] = useState("i-can-swim");
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState<Date>(defaultDate);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("10:00");
  const [poolArea, setPoolArea] = useState("shallow");
  const [instructorName, setInstructorName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const isEditing = !!editEvent;

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
        // Auto-set end time to 1 hour later
        const [h, m] = prefillStartTime.split(":").map(Number);
        const endH = Math.min(h + 1, 20);
        setEndTime(`${endH.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
      }
    }
  }, [editEvent, open, prefillStartTime]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload = {
      event_type: eventType,
      title: title.trim(),
      event_date: format(eventDate, "yyyy-MM-dd"),
      start_time: startTime,
      end_time: endTime,
      pool_area: poolArea,
      instructor_name: instructorName.trim() || null,
      notes: notes.trim() || null,
    };

    const { error } = isEditing
      ? await supabase.from("pool_events").update(payload).eq("id", editEvent!.id)
      : await supabase.from("pool_events").insert(payload);

    setSaving(false);

    if (error) {
      toast({ title: "Failed to save event", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: isEditing ? "Event updated" : "Event added" });
    onOpenChange(false);
    resetForm();
    onSaved();
  };

  const resetForm = () => {
    setEventType("i-can-swim");
    setTitle("");
    setEventDate(defaultDate);
    setStartTime("08:00");
    setEndTime("10:00");
    setPoolArea("shallow");
    setInstructorName("");
    setNotes("");
  };

  const handleTypeChange = (type: string) => {
    setEventType(type);
    if (type === "i-can-swim") {
      setTitle("I Can Swim 209");
      setPoolArea("shallow");
    } else if (type === "private-lesson") {
      setTitle("Private Lesson");
      setPoolArea("shallow");
    } else if (type === "semi-private-lesson") {
      setTitle("Semi-Private Lesson");
      setPoolArea("shallow");
    } else if (type === "dive-session") {
      setTitle("Dive Training");
      setPoolArea("deep");
    } else if (type === "pool-rental") {
      setTitle("");
      setPoolArea("full");
    } else if (type === "maintenance") {
      setTitle("Pool Maintenance");
      setPoolArea("full");
    } else {
      setTitle("");
      setPoolArea("full");
    }
  };

  const showInstructor = eventType === "dive-session" || eventType === "i-can-swim" || eventType === "private-lesson" || eventType === "semi-private-lesson";
  const showTitle = eventType === "pool-rental" || eventType === "other";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-4 gap-3">
        <DialogHeader className="pb-0">
          <DialogTitle className="text-base">{isEditing ? "Edit Event" : "New Event"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {/* Event type as compact radio-style chips */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { value: "i-can-swim", label: "I Can Swim" },
              { value: "private-lesson", label: "Private" },
              { value: "semi-private-lesson", label: "Semi-Private" },
              { value: "dive-session", label: "Dive" },
              { value: "pool-rental", label: "Rental" },
              { value: "maintenance", label: "Maintenance" },
              { value: "other", label: "Other" },
            ].map((t) => (
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

          {/* Title — only shown for types that need manual entry */}
          {showTitle && (
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event name" className="h-8 text-sm" />
          )}

          {/* Date + times in one row */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Date</Label>
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

          {/* Instructor + Notes inline */}
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
