import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, CalendarDays, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface LessonDate {
  id: string;
  lesson_date: string;
  is_cancelled: boolean;
  cancel_reason: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Any one session_id from this time slot — used to look up the period dates */
  sessionIds: string[];
  sessionStartDate: string;
  sessionEndDate: string;
  sessionLabel: string;
  /** e.g. "monday_wednesday", "tuesday_thursday", "saturday" */
  daysOfWeek: string;
}

const DAY_NAME_TO_NUM: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function parseDaysOfWeek(daysOfWeek: string): number[] {
  return daysOfWeek
    .split("_")
    .map(d => DAY_NAME_TO_NUM[d.toLowerCase()])
    .filter(n => n !== undefined);
}

function generateLessonDates(start: string, end: string, daysOfWeek: string): string[] {
  const allowedDays = parseDaysOfWeek(daysOfWeek);
  if (allowedDays.length === 0) return [];
  const dates: string[] = [];
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const cur = new Date(s);
  while (cur <= e) {
    if (allowedDays.includes(cur.getDay())) {
      dates.push(cur.toISOString().slice(0, 10));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function formatDate(d: string) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const ManageDatesModal = ({ open, onOpenChange, sessionIds, sessionStartDate, sessionEndDate, sessionLabel }: Props) => {
  const [dates, setDates] = useState<LessonDate[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchDates = async () => {
    if (sessionIds.length === 0) return;
    setLoading(true);
    // Fetch dates for the first session_id (one set of dates per slot)
    const { data } = await supabase
      .from("session_lesson_dates")
      .select("*")
      .in("session_id", sessionIds)
      .order("lesson_date");
    
    // Deduplicate by lesson_date (multiple session_ids may share dates)
    const seen = new Map<string, LessonDate>();
    data?.forEach(d => {
      if (!seen.has(d.lesson_date)) seen.set(d.lesson_date, d);
    });
    setDates(Array.from(seen.values()));
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchDates();
  }, [open, sessionIds.join(",")]);

  const handleGenerate = async () => {
    if (!sessionStartDate || !sessionEndDate) {
      toast({ title: "Missing date range", description: "Session start/end dates are not set.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    const monWed = generateMonWedDates(sessionStartDate, sessionEndDate);
    
    if (monWed.length === 0) {
      toast({ title: "No Mon/Wed dates found in range", variant: "destructive" });
      setGenerating(false);
      return;
    }

    // Insert for each session_id at this slot
    for (const sid of sessionIds) {
      const rows = monWed.map(d => ({ session_id: sid, lesson_date: d }));
      const { error } = await supabase
        .from("session_lesson_dates")
        .upsert(rows, { onConflict: "session_id,lesson_date" });

      if (error) {
        console.error("Upsert error for session", sid, error);
        toast({ title: "Error generating dates", description: error.message, variant: "destructive" });
        setGenerating(false);
        return;
      }
    }

    toast({ title: `${monWed.length} class dates generated` });
    setGenerating(false);
    fetchDates();
  };

  const toggleCancel = async (dateRow: LessonDate) => {
    const newVal = !dateRow.is_cancelled;
    // Update all session_ids for this lesson_date
    const { error } = await supabase
      .from("session_lesson_dates")
      .update({ is_cancelled: newVal, cancel_reason: newVal ? dateRow.cancel_reason : null })
      .in("session_id", sessionIds)
      .eq("lesson_date", dateRow.lesson_date);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setDates(prev => prev.map(d => d.lesson_date === dateRow.lesson_date ? { ...d, is_cancelled: newVal } : d));
  };

  const updateReason = async (dateRow: LessonDate, reason: string) => {
    await supabase
      .from("session_lesson_dates")
      .update({ cancel_reason: reason || null })
      .in("session_id", sessionIds)
      .eq("lesson_date", dateRow.lesson_date);

    setDates(prev => prev.map(d => d.lesson_date === dateRow.lesson_date ? { ...d, cancel_reason: reason } : d));
  };

  const activeCount = dates.filter(d => !d.is_cancelled).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5" />
            Manage Class Dates
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{sessionLabel}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : dates.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-muted-foreground">No class dates generated yet.</p>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Generate Mon/Wed Dates
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{activeCount} active classes</span>
              <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating}>
                {generating && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                Regenerate
              </Button>
            </div>
            <div className="space-y-2">
              {dates.map(d => (
                <div key={d.id} className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${d.is_cancelled ? "bg-destructive/5 border-destructive/20" : "border-border"}`}>
                  <Switch
                    checked={!d.is_cancelled}
                    onCheckedChange={() => toggleCancel(d)}
                    className="shrink-0"
                  />
                  <span className={`text-sm min-w-[120px] ${d.is_cancelled ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {formatDate(d.lesson_date)}
                  </span>
                  {d.is_cancelled && (
                    <Input
                      placeholder="Reason (e.g. 4th of July)"
                      value={d.cancel_reason || ""}
                      onChange={e => updateReason(d, e.target.value)}
                      className="h-7 text-xs flex-1"
                    />
                  )}
                  {d.is_cancelled && (
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ManageDatesModal;
