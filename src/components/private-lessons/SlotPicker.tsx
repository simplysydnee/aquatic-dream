import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronLeft, X } from "lucide-react";
import { fetchInstructors, fetchOpenSlots, holdSlots, Slot } from "@/lib/privateBooking";

interface Props {
  sessionToken: string;
  onContinue: (slots: Slot[]) => void;
  onBack: () => void;
}

const WEEKS = 8;
const MIN_RECURRING_WEEKS = 3;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_PLURAL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + "T00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function slotKey(s: Slot) {
  return `${s.instructor_id}|${s.slot_date}|${s.start_time}`;
}

interface RecurringPattern {
  key: string; // instructorId|dow|startTime
  instructorId: string;
  instructorName: string;
  dow: number;
  startTime: string;
  slots: Slot[]; // open slots in window
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
  const [activePatternKey, setActivePatternKey] = useState<string | null>(null);

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

  // Clear selections when switching modes to avoid mixing.
  const handleWeeklyToggle = (checked: boolean) => {
    setWeeklyMode(checked);
    setSelected({});
    setActivePatternKey(null);
  };

  const toggleDay = (d: number) => {
    setDayFilter((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  // Per-day grid filtering (non-weekly mode)
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
    const k = slotKey(s);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[k]) delete next[k];
      else next[k] = s;
      return next;
    });
  };

  // ----- Recurring patterns -----
  // Group all open slots by (instructor, dow, startTime); keep patterns with
  // >= MIN_RECURRING_WEEKS open weeks. Honor AM/PM filter.
  const recurringPatterns = useMemo<RecurringPattern[]>(() => {
    const timeOk = (start: string) => {
      if (timeFilter === "all") return true;
      const hour = Number(start.split(":")[0]);
      if (timeFilter === "am") return hour < 12;
      return hour >= 12;
    };
    const buckets = new Map<string, RecurringPattern>();
    for (const s of slots) {
      if (!timeOk(s.start_time)) continue;
      const dow = new Date(s.slot_date + "T00:00").getDay();
      const key = `${s.instructor_id}|${dow}|${s.start_time}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          instructorId: s.instructor_id,
          instructorName: s.instructor_name,
          dow,
          startTime: s.start_time,
          slots: [],
        });
      }
      buckets.get(key)!.slots.push(s);
    }
    const list = [...buckets.values()].filter((p) => p.slots.length >= MIN_RECURRING_WEEKS);
    for (const p of list) p.slots.sort((a, b) => a.slot_date.localeCompare(b.slot_date));
    list.sort((a, b) =>
      a.instructorName.localeCompare(b.instructorName) ||
      a.dow - b.dow ||
      a.startTime.localeCompare(b.startTime)
    );
    return list;
  }, [slots, timeFilter]);

  const activePattern = useMemo(
    () => recurringPatterns.find((p) => p.key === activePatternKey) || null,
    [recurringPatterns, activePatternKey],
  );

  const choosePattern = (p: RecurringPattern) => {
    setActivePatternKey(p.key);
    // Pre-select every open week in the pattern.
    const next: Record<string, Slot> = {};
    for (const s of p.slots) next[slotKey(s)] = s;
    setSelected(next);
  };

  const clearPattern = () => {
    setActivePatternKey(null);
    setSelected({});
  };

  const removeWeek = (s: Slot) => {
    setSelected((prev) => {
      const next = { ...prev };
      delete next[slotKey(s)];
      return next;
    });
  };

  const selectedList = Object.values(selected).sort((a, b) =>
    (a.slot_date + a.start_time).localeCompare(b.slot_date + b.start_time));

  const handleContinue = async () => {
    if (!selectedList.length) return;
    await holdSlots(selectedList, sessionToken);
    onContinue(selectedList);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h3 className="font-display text-2xl font-bold text-foreground mb-1">Pick your lesson times</h3>
      <p className="text-muted-foreground text-sm mb-6">
        Tap any open slot. You can pick multiple days, or use "Show weekly options" to book a recurring day/time.
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
          <Switch id="weekly" checked={weeklyMode} onCheckedChange={handleWeeklyToggle} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {!weeklyMode && (
          <>
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
          </>
        )}
        <span className={`text-xs font-semibold text-muted-foreground mr-1 ${weeklyMode ? "" : "ml-3"}`}>Time:</span>
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

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading availability…
        </div>
      ) : weeklyMode ? (
        // ===== Weekly recurring picker =====
        activePattern ? (
          <div className="border border-border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div>
                <p className="font-semibold text-sm">
                  {WEEKDAYS_PLURAL[activePattern.dow]} at {formatTime(activePattern.startTime)}
                </p>
                <p className="text-xs text-muted-foreground">
                  with {activePattern.instructorName} · {activePattern.slots.length} weekly {activePattern.slots.length === 1 ? "date" : "dates"} available
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={clearPattern}>Pick a different time</Button>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              All weeks are included by default. Tap × on any week you want to skip.
            </p>
            <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
              {activePattern.slots.map((s) => {
                const k = slotKey(s);
                const kept = !!selected[k];
                return (
                  <div
                    key={k}
                    className={`flex items-center justify-between border rounded-md px-3 py-2 text-sm transition ${
                      kept ? "bg-background border-border" : "bg-muted/50 border-dashed border-border text-muted-foreground line-through"
                    }`}
                  >
                    <span>{formatShortDate(s.slot_date)}</span>
                    {kept ? (
                      <button
                        type="button"
                        onClick={() => removeWeek(s)}
                        aria-label={`Skip ${formatShortDate(s.slot_date)}`}
                        className="text-muted-foreground hover:text-destructive p-1 rounded transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelected((prev) => ({ ...prev, [k]: s }))}
                        className="text-xs text-primary underline"
                      >
                        Add back
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : recurringPatterns.length === 0 ? (
          <div className="border border-border rounded-lg p-8 text-center bg-muted/30">
            <p className="text-sm text-muted-foreground">
              No recurring weekly slots available {timeFilter !== "all" ? `for ${timeFilter.toUpperCase()} times` : ""}.
              Try a different instructor or turn off weekly options to pick individual dates.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
            <p className="text-xs text-muted-foreground mb-1">
              Each option is a recurring day and time that repeats weekly. Pick one to see all available dates.
            </p>
            {recurringPatterns.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => choosePattern(p)}
                className="w-full text-left border border-border rounded-lg p-3 hover:border-primary hover:bg-muted/40 transition"
              >
                <p className="text-sm font-semibold">
                  {WEEKDAYS_PLURAL[p.dow]} at {formatTime(p.startTime)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.instructorName} · {p.slots.length} of {WEEKS} weeks
                </p>
              </button>
            ))}
          </div>
        )
      ) : byDate.length === 0 ? (
        <div className="border border-border rounded-lg p-8 text-center bg-muted/30">
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No availability in the next {WEEKS} weeks. Try a different instructor.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-2">No slots match your filters.</p>
              <button
                type="button"
                onClick={() => { setDayFilter(new Set()); setTimeFilter("all"); }}
                className="text-xs text-primary underline"
              >
                Clear filters
              </button>
            </>
          )}
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
                    const k = slotKey(s);
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
