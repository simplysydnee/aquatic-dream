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
}

const AddPoolEventDialog = ({ open, onOpenChange, defaultDate, onSaved, editEvent }: Props) => {
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
    }
  }, [editEvent, open]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Pool Event" : "Add Pool Event"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Event Type</Label>
            <Select value={eventType} onValueChange={handleTypeChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="i-can-swim">I Can Swim 209</SelectItem>
                <SelectItem value="private-lesson">Private Lesson</SelectItem>
                <SelectItem value="semi-private-lesson">Semi-Private Lesson</SelectItem>
                <SelectItem value="dive-session">Dive Session</SelectItem>
                <SelectItem value="pool-rental">Pool Rental</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event name" />
          </div>

          <div className="space-y-2">
            <Label>Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  {format(eventDate, "PPP")}
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pool Area</Label>
            <Select value={poolArea} onValueChange={setPoolArea}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="shallow">Shallow End</SelectItem>
                <SelectItem value="deep">Deep End</SelectItem>
                <SelectItem value="full">Full Pool</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(eventType === "dive-session" || eventType === "i-can-swim" || eventType === "private-lesson" || eventType === "semi-private-lesson") && (
            <div className="space-y-2">
              <Label>Instructor Name</Label>
              <Input value={instructorName} onChange={(e) => setInstructorName(e.target.value)} placeholder="Optional" />
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" rows={2} />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : isEditing ? "Update Event" : "Add Event"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddPoolEventDialog;
