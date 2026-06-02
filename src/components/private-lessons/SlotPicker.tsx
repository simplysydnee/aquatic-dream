import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronLeft } from "lucide-react";
import { fetchInstructors, fetchOpenSlots, holdSlots, Slot } from "@/lib/privateBooking";

interface Props {
  sessionToken: string;
  onContinue: (slots: Slot[]) => void;
  onBack: () => void;
}

const WEEKS = 8;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function SlotPicker({ sessionToken, onContinue, onBack }: Props) {
  const [instructors, setInstructors] = useState<{ id: string; name: string }[]>([]);
  const [instructorId, setInstructorId] = useState<string>("any");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, Slot>>({});
  const [weeklyMode, setWeeklyMode] = useState(false);
  const [dayFilter, setDayFilter] = useState<Set<number>>(new Set());
  const [timeFilter, setTimeFilter] = useState<"all" | "am" | "pm">("all");

  useEffect(() => {
    fetchInstructors().then(setInstructors);
  }, []);

  useEffect(() => {
    setLoading(true);
    const from = new Date(); from.setHours(0, 0, 0, 0);
    fetchOpenSlots({
      fromDate: from,
      weeks: WEEKS,
      instructorIds: instructorId === "any" ? undefined : [instructorId],
      sessionToken,
    }).then((s) => { setSlots(s); setLoading(false); });
  }, [instructorId, sessionToken]);

  const toggleDay = (d: number) => {
    setDayFilter((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  const filteredSlots = useMemo(() => {
    return slots.filter((s) => {
      const dow = new Date(s.slot_date + "T00:00").getDay();
      if (dayFilter.size > 0 && !dayFilter.has(dow)) return false;
      if (timeFilter !== "all") {
        const hour = Number(s.start_time.split(":")[0]);
        if (timeFilter === "am" && hour >= 12) return false;
        if (timeFilter === "pm" && hour < 12) return false;
      }
      return true;
    });
  }, [slots, dayFilter, timeFilter]);

  // Group by date
  const byDate = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of filteredSlots) {
      if (!m.has(s.slot_date)) m.set(s.slot_date, []);
      m.get(s.slot_date)!.push(s);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredSlots]);

  const toggle = (s: Slot) => {
    const k = `${s.instructor_id}|${s.slot_date}|${s.start_time}`;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[k]) delete next[k];
      else next[k] = s;
      return next;
    });
  };

  const applyWeekly = (instructorIdSel: string, startTime: string, dayOfWeek: number) => {
    const matches = slots.filter((s) =>
      s.instructor_id === instructorIdSel &&
      s.start_time === startTime &&
      new Date(s.slot_date + "T00:00").getDay() === dayOfWeek);
    const next = { ...selected };
    for (const s of matches) {
      const k = `${s.instructor_id}|${s.slot_date}|${s.start_time}`;
      next[k] = s;
    }
    setSelected(next);
  };

  const selectedList = Object.values(selected).sort((a, b) =>
    (a.slot_date + a.start_time).localeCompare(b.slot_date + b.start_time));

  const handleContinue = async () => {
    if (!selectedList.length) return;
    await holdSlots(selectedList, sessionToken);
    onContinue(selectedList);
  };

  // For weekly helper: derive available recurring options grouped by instructor.
  // Show every instructor that has at least one recurring pattern (>=2 dates same DOW/time).
  const weeklyGroups = useMemo(() => {
    const seen = new Set<string>();
    const byInstructor = new Map<string, { instructorId: string; instructorName: string; opts: { key: string; label: string; instructorId: string; startTime: string; dow: number; count: number }[] }>();
    for (const s of filteredSlots) {
      const dow = new Date(s.slot_date + "T00:00").getDay();
      const key = `${s.instructor_id}|${dow}|${s.start_time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const count = filteredSlots.filter((x) =>
        x.instructor_id === s.instructor_id && x.start_time === s.start_time &&
        new Date(x.slot_date + "T00:00").getDay() === dow).length;
      if (count < 2) continue;
      if (!byInstructor.has(s.instructor_id)) {
        byInstructor.set(s.instructor_id, { instructorId: s.instructor_id, instructorName: s.instructor_name, opts: [] });
      }
      byInstructor.get(s.instructor_id)!.opts.push({
        key, instructorId: s.instructor_id, startTime: s.start_time, dow, count,
        label: `${WEEKDAYS[dow]}s at ${formatTime(s.start_time)} (${count} dates)`,
      });
    }
    // Sort each instructor's options by day-of-week then time; cap at 20 per instructor
    const groups = [...byInstructor.values()].map((g) => ({
      ...g,
      opts: g.opts.sort((a, b) => a.dow - b.dow || a.startTime.localeCompare(b.startTime)).slice(0, 20),
    }));
    // Sort instructors alphabetically
    groups.sort((a, b) => a.instructorName.localeCompare(b.instructorName));
    return groups;
  }, [filteredSlots]);


  return (
    <div className="max-w-3xl mx-auto">
      <h3 className="font-display text-2xl font-bold text-foreground mb-1">Pick your lesson times</h3>
      <p className="text-muted-foreground text-sm mb-6">
        Tap any open slot. You can pick multiple days, or use "Book weekly" to add a recurring day.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div>
          <Label>Instructor</Label>
          <Select value={instructorId} onValueChange={setInstructorId}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any available instructor</SelectItem>
              {instructors.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-end gap-3">
          <Label htmlFor="weekly">Show weekly options</Label>
          <Switch id="weekly" checked={weeklyMode} onCheckedChange={setWeeklyMode} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs font-semibold text-muted-foreground mr-1">Days:</span>
        {WEEKDAYS.map((label, idx) => {
          const active = dayFilter.has(idx);
          return (
            <button
              key={idx}
              type="button"
              onClick={() => toggleDay(idx)}
              className={`px-2.5 py-1 text-xs rounded-md border transition ${active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted border-border"}`}
            >
              {label}
            </button>
          );
        })}
        {dayFilter.size > 0 && (
          <button type="button" onClick={() => setDayFilter(new Set())}
            className="text-xs text-muted-foreground underline ml-1">Clear</button>
        )}
        <span className="text-xs font-semibold text-muted-foreground ml-3 mr-1">Time:</span>
        {(["all", "am", "pm"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setTimeFilter(v)}
            className={`px-2.5 py-1 text-xs rounded-md border transition ${timeFilter === v
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background hover:bg-muted border-border"}`}
          >
            {v === "all" ? "All" : v.toUpperCase()}
          </button>
        ))}
      </div>

      {weeklyMode && (
        <div className="border border-border rounded-lg p-4 mb-6 bg-muted/30">
          <p className="text-sm font-semibold mb-3">Recurring slot quick-picks</p>
          {weeklyOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recurring patterns available.</p>
          ) : (
            <div className="grid gap-2">
              {weeklyOptions.map((o) => (
                <Button key={o.key} variant="outline" size="sm" className="justify-start"
                  onClick={() => applyWeekly(o.instructorId, o.startTime, o.dow)}>
                  {o.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading availability…
        </div>
      ) : byDate.length === 0 ? (
        <div className="border border-border rounded-lg p-8 text-center bg-muted/30">
          <p className="text-sm text-muted-foreground">No availability in the next {WEEKS} weeks. Try a different instructor.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
          {byDate.map(([date, daySlots]) => {
            const d = new Date(date + "T00:00");
            const label = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
            return (
              <div key={date} className="border border-border rounded-lg p-3">
                <p className="text-sm font-semibold mb-2">{label}</p>
                <div className="flex flex-wrap gap-2">
                  {daySlots.map((s) => {
                    const k = `${s.instructor_id}|${s.slot_date}|${s.start_time}`;
                    const isSel = !!selected[k];
                    return (
                      <button key={k} onClick={() => toggle(s)} type="button"
                        className={`px-3 py-1.5 text-xs rounded-md border transition ${isSel
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted border-border"}`}>
                        {formatTime(s.start_time)} · {s.instructor_name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="sticky bottom-0 mt-6 bg-background/95 backdrop-blur border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onBack}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="text-sm">
            {selectedList.length > 0 ? (
              <span className="font-semibold">
                {selectedList.length} lesson{selectedList.length === 1 ? "" : "s"} · ${selectedList.length * 65} total
                <span className="block text-xs text-muted-foreground font-normal">
                  $65 charged after each lesson
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Select at least one slot</span>
            )}
          </div>
          <Button onClick={handleContinue} disabled={!selectedList.length}>Continue</Button>
        </div>
      </div>
    </div>
  );
}
