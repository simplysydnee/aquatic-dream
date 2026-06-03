import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate: Date;
}

interface Instructor { id: string; name: string }

export default function PrintDayScheduleDialog({ open, onOpenChange, defaultDate }: Props) {
  const [date, setDate] = useState(format(defaultDate, "yyyy-MM-dd"));
  const [instructorId, setInstructorId] = useState("all");
  const [instructors, setInstructors] = useState<Instructor[]>([]);

  useEffect(() => {
    setDate(format(defaultDate, "yyyy-MM-dd"));
  }, [defaultDate, open]);

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

  const handlePrint = () => {
    const url = `/admin/print-day-schedule?date=${date}&instructor=${instructorId}`;
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
            Roster + parent &amp; emergency contact info for the selected instructor.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Instructor</Label>
            <Select value={instructorId} onValueChange={setInstructorId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All instructors</SelectItem>
                {instructors.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handlePrint} className="w-full gap-2">
            <Printer className="w-4 h-4" /> Open Print View
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
