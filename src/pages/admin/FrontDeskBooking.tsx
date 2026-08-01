import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { CalendarPlus, Clock, Loader2, RefreshCw, User, Waves } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import BookingQuickDialog from "@/components/admin/booking/BookingQuickDialog";
import { useOpenPrivateSlots, type OpenPrivateSlot } from "@/hooks/useOpenPrivateSlots";

const RANGES = [
  { key: 7, label: "This week" },
  { key: 14, label: "2 weeks" },
  { key: 28, label: "4 weeks" },
] as const;

const slotKey = (s: Pick<OpenPrivateSlot, "instructor_id" | "slot_date" | "start_time">) =>
  `${s.instructor_id}|${s.slot_date}|${s.start_time}`;

const formatTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
};

const poolLabel = (area: string) =>
  area === "deep" ? "Deep end" : area === "shallow" ? "Shallow end" : area.replace(/_/g, " ");

export const FrontDeskBooking = () => {
  const [days, setDays] = useState<number>(28);
  const [prefill, setPrefill] = useState<OpenPrivateSlot | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  // Slots booked in this session are hidden immediately so a second staff tap
  // cannot double-book the same instructor/date/time before the refetch lands.
  const [justBooked, setJustBooked] = useState<Set<string>>(new Set());

  const today = useMemo(() => new Date(), []);
  const startDateStr = format(today, "yyyy-MM-dd");
  const endDateStr = format(addDays(today, days), "yyyy-MM-dd");

  const { slots, loading, refetch } = useOpenPrivateSlots(startDateStr, endDateStr);

  // Keep the list fresh when staff come back to the tab or another device books.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refetch]);

  const visibleSlots = useMemo(
    () => slots.filter((s) => !justBooked.has(slotKey(s))),
    [slots, justBooked],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, OpenPrivateSlot[]>();
    for (const s of visibleSlots) {
      const list = map.get(s.slot_date) || [];
      list.push(s);
      map.set(s.slot_date, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => ({
        date,
        list: [...list].sort((a, b) =>
          a.start_time === b.start_time
            ? a.instructor_name.localeCompare(b.instructor_name)
            : a.start_time.localeCompare(b.start_time),
        ),
      }));
  }, [visibleSlots]);

  const openSlot = (slot: OpenPrivateSlot) => {
    setPrefill(slot);
    setBookOpen(true);
  };

  const handleBooked = useCallback(() => {
    if (prefill) {
      const key = slotKey(prefill);
      setJustBooked((prev) => new Set(prev).add(key));
    }
    refetch();
  }, [prefill, refetch]);


  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="space-y-3">
        <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
          <CalendarPlus className="h-8 w-8 text-primary" />
          Book a lesson
        </h1>
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <Button
              key={r.key}
              size="lg"
              variant={days === r.key ? "default" : "outline"}
              className="h-12 px-6 text-base"
              onClick={() => setDays(r.key)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-lg">Loading open slots</span>
        </div>
      ) : grouped.length === 0 ? (
        <Card className="p-10 text-center text-lg text-muted-foreground">
          No open slots in this range.
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map((g) => (
            <section key={g.date} className="space-y-3">
              <h2 className="text-xl md:text-2xl font-semibold border-b pb-2">
                {format(parseISO(g.date), "EEEE, MMM d")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {g.list.map((s) => (
                  <button
                    key={`${s.instructor_id}|${s.slot_date}|${s.start_time}`}
                    type="button"
                    onClick={() => openSlot(s)}
                    className="text-left rounded-xl border bg-card p-5 min-h-[112px] transition hover:border-primary hover:bg-muted/50 active:scale-[0.99]"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-2xl font-bold">{formatTime(s.start_time)}</span>
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {s.slot_minutes} min
                      </span>
                    </div>
                    <div className="mt-3 space-y-1 text-base">
                      <p className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {s.instructor_name}
                      </p>
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Waves className="h-4 w-4" />
                        {poolLabel(s.pool_area)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <BookingQuickDialog
        open={bookOpen}
        onOpenChange={setBookOpen}
        initialSlot={prefill ? {
          mode: "one_time",
          instructorId: prefill.instructor_id,
          instructorName: prefill.instructor_name,
          date: prefill.slot_date,
          startTime: prefill.start_time,
          endTime: prefill.end_time,
          poolArea: prefill.pool_area,
        } : undefined}
        initialType={prefill?.default_lesson_type === "semi_private" ? "semi_private" : "private"}
        lockedSlot
        onBooked={refetch}
      />
    </div>
  );
};

export default FrontDeskBooking;
