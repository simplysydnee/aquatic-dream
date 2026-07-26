import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronLeft, X } from "lucide-react";
import { fetchInstructors, fetchOpenSlots, holdSlots, Slot } from "@/lib/privateBooking";
import { getPrivateLessonPrice, isPromoDate, PRIVATE_REGULAR_PRICE, PRIVATE_PROMO_PRICE, PROMO_LABEL } from "@/lib/privateLessonPricing";
import { toast } from "@/hooks/use-toast";

interface Props {
  sessionToken: string;
  onContinue: (slots: Slot[]) => void;
  onBack: () => void;
  initialSelected?: Slot[];
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

// Same start time with different coaches is real availability, not a duplicate.
// Group so the time prints once with a coach button each.
function groupByTime(daySlots: Slot[]): [string, Slot[]][] {
  const m = new Map<string, Slot[]>();
  for (const s of daySlots) {
    if (!m.has(s.start_time)) m.set(s.start_time, []);
    m.get(s.start_time)!.push(s);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.instructor_name.localeCompare(b.instructor_name));
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
}


interface RecurringPattern {
  key: string; // instructorId|dow|startTime
  instructorId: string;
  instructorName: string;
  dow: number;
  startTime: string;
  slots: Slot[]; // open slots in window
}

export default function SlotPicker({ sessionToken, onContinue, onBack, initialSelected }: Props) {
  const [instructors, setInstructors] = useState<{ id: string; name: string }[]>([]);
  const [instructorId, setInstructorId] = useState<string>("any");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, Slot>>(() => {
    if (!initialSelected?.length) return {};
    return Object.fromEntries(initialSelected.map((s) => [slotKey(s), s]));
  });

  const [weeklyMode, setWeeklyMode] = useState(false);
  const [dayFilter, setDayFilter] = useState<Set<number>>(new Set());
  const [timeFilter, setTimeFilter] = useState<"all" | "am" | "pm">("all");
  const [activePatternKey, setActivePatternKey] = useState<string | null>(null);

  useEffect(() => {
    fetchInstructors().then(setInstructors);
  }, []);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    const from = new Date(); from.setHours(0, 0, 0, 0);
    fetchOpenSlots({
      fromDate: from,
      weeks: WEEKS,
      instructorIds: instructorId === "any" ? undefined : [instructorId],
      sessionToken,
    }).then((s) => { setSlots(s); setLoading(false); });
  }, [instructorId, sessionToken, refreshKey]);

  // Silently re-fetch availability when the user returns to the tab/window —
  // catches slots that were taken by another parent while they were away.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") setRefreshKey((k) => k + 1);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);


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

  const lockedInstructorId = useMemo(() => {
    const first = Object.values(selected)[0];
    return first ? first.instructor_id : null;
  }, [selected]);
  const lockedInstructorName = useMemo(() => {
    const first = Object.values(selected)[0];
    return first ? first.instructor_name : null;
  }, [selected]);

  const toggle = (s: Slot) => {
    const k = slotKey(s);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[k]) { delete next[k]; return next; }
      const existing = Object.values(prev)[0];
      if (existing && existing.instructor_id !== s.instructor_id) {
        toast({
          title: "One instructor per booking",
          description: `You're booking with ${existing.instructor_name}. Clear your selection to switch instructors.`,
          variant: "destructive",
        });
        return prev;
      }
      next[k] = s;
      return next;
    });
  };

  // ----- Recurring patterns -----
  // Group all open slots by (instructor, dow, startTime); keep patterns with
  // >= MIN_RECURRING_WEEKS open weeks. Honor AM/PM and day-of-week filters.
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
      if (dayFilter.size > 0 && !dayFilter.has(dow)) continue;
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
  }, [slots, timeFilter, dayFilter]);

  // Group recurring patterns that share a day + time so two coaches on the same
  // hours read as one time with a coach choice, not as duplicate rows.
  const groupedPatterns = useMemo<[string, RecurringPattern[]][]>(() => {
    const m = new Map<string, RecurringPattern[]>();
    for (const p of recurringPatterns) {
      const k = `${p.dow}|${p.startTime}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return [...m.entries()].sort(([, a], [, b]) =>
      a[0].dow - b[0].dow || a[0].startTime.localeCompare(b[0].startTime));
  }, [recurringPatterns]);


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
        <span className="text-xs font-semibold text-muted-foreground mr-1 ml-3">Time:</span>
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
              Each option is a recurring day and time that repeats weekly. Pick a coach to see all available dates.
            </p>
            {groupedPatterns.map(([groupKey, group]) => (
              <div key={groupKey} className="border border-border rounded-lg p-3">
                <p className="text-sm font-semibold">
                  {WEEKDAYS_PLURAL[group[0].dow]} at {formatTime(group[0].startTime)}
                </p>
                {group.length > 1 && (
                  <p className="text-[11px] text-muted-foreground mb-1.5">
                    {group.length} coaches available at this time
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {group.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => choosePattern(p)}
                      className="text-left border border-border rounded-md px-3 py-1.5 hover:border-primary hover:bg-muted/40 transition"
                    >
                      <span className="text-xs font-medium block">{p.instructorName}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {p.slots.length} {p.slots.length === 1 ? "session" : "sessions"} available
                      </span>
                    </button>
                  ))}
                </div>
              </div>
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
                <div className="space-y-1.5">
                  {groupByTime(daySlots).map(([time, timeSlots]) => (
                    <div key={time} className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground tabular-nums min-w-[68px]">
                        {formatTime(time)}
                      </span>
                      {timeSlots.map((s) => {
                        const k = slotKey(s);
                        const isSel = !!selected[k];
                        const promo = isPromoDate(s.slot_date);
                        const blockedByInstructor = !!lockedInstructorId && lockedInstructorId !== s.instructor_id && !isSel;
                        return (
                          <button
                            key={k}
                            onClick={() => toggle(s)}
                            type="button"
                            disabled={blockedByInstructor}
                            title={blockedByInstructor ? `Different instructor — clear selection to switch to ${s.instructor_name}` : undefined}
                            className={`px-3 py-1.5 text-xs rounded-md border transition ${isSel
                              ? "bg-primary text-primary-foreground border-primary"
                              : blockedByInstructor
                              ? "bg-muted/40 text-muted-foreground border-dashed border-border opacity-50 cursor-not-allowed"
                              : "bg-background hover:bg-muted border-border"}`}>
                            {s.instructor_name}
                            {promo && (
                              <span className={`ml-1.5 font-semibold ${isSel ? "text-primary-foreground" : "text-coral"}`}>${PRIVATE_PROMO_PRICE}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {lockedInstructorName && !weeklyMode && (
        <p className="mt-3 text-xs text-muted-foreground">
          Booking with <span className="font-semibold text-foreground">{lockedInstructorName}</span>. All lessons in this booking must be with the same instructor.{" "}
          <button type="button" onClick={() => setSelected({})} className="text-primary underline ml-1">
            Clear selection
          </button>
        </p>
      )}

      <div className="sticky bottom-0 mt-6 bg-background/95 backdrop-blur border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onBack}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="text-sm">
            {selectedList.length > 0 ? (() => {
              const perPrices = selectedList.map((s) => getPrivateLessonPrice("private", s.slot_date));
              const total = perPrices.reduce((a, b) => a + b, 0);
              const anyPromo = perPrices.some((p) => p < PRIVATE_REGULAR_PRICE);
              const allPromo = perPrices.every((p) => p < PRIVATE_REGULAR_PRICE);
              return (
                <span className="font-semibold">
                  {selectedList.length} lesson{selectedList.length === 1 ? "" : "s"} ·{" "}
                  {anyPromo && <span className="line-through text-muted-foreground mr-1 font-normal">${selectedList.length * PRIVATE_REGULAR_PRICE}</span>}
                  ${total} total
                  <span className="block text-xs text-muted-foreground font-normal">
                    {allPromo
                      ? `$${PRIVATE_PROMO_PRICE} ${PROMO_LABEL} — charged after each lesson`
                      : anyPromo
                      ? `Promo lessons $${PRIVATE_PROMO_PRICE}, others $${PRIVATE_REGULAR_PRICE} — charged after each lesson`
                      : `$${PRIVATE_REGULAR_PRICE} charged after each lesson`}
                  </span>
                </span>
              );
            })() : (
              <span className="text-muted-foreground">Select at least one slot</span>
            )}
          </div>
          <Button onClick={handleContinue} disabled={!selectedList.length}>Continue</Button>
        </div>
      </div>
    </div>
  );
}
