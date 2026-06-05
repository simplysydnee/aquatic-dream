import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export interface AvailableSlot {
  instructorId: string;
  instructorName: string;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  poolArea: string; // suggested pool area (defaults to shallow if free)
}

interface Options {
  /** Lesson length in minutes (e.g. 60 for private, 45 for semi). */
  lengthMin: number;
  /** Step between candidate start times in minutes. */
  stepMin?: number;
  /** Pool area to check conflicts against. */
  poolArea?: string;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
const fromMin = (mins: number) =>
  `${Math.floor(mins / 60).toString().padStart(2, "0")}:${(mins % 60).toString().padStart(2, "0")}`;

/**
 * Returns suggested open lesson slots for a given date by intersecting
 * published instructor shifts with the existing pool_events (avoiding
 * conflicts in the same pool area).
 */
export function useAvailableSlots(
  date: Date | null,
  { lengthMin, stepMin = 30, poolArea = "shallow" }: Options,
) {
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasAnyShift, setHasAnyShift] = useState(false);

  useEffect(() => {
    if (!date) {
      setSlots([]);
      setHasAnyShift(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      const dateStr = format(date, "yyyy-MM-dd");

      const [shiftsRes, eventsRes, instructorsRes] = await Promise.all([
        supabase
          .from("shifts")
          .select("id, instructor_id, start_time, end_time, status")
          .eq("shift_date", dateStr)
          .eq("status", "published")
          .not("instructor_id", "is", null),
        supabase
          .from("pool_events")
          .select("start_time, end_time, pool_area")
          .eq("event_date", dateStr),
        supabase.rpc("get_active_instructors_public"),
      ]);

      if (cancelled) return;

      const instructors = (instructorsRes.data || []) as { id: string; name: string }[];
      const nameById = new Map(instructors.map((i) => [i.id, i.name]));

      const events = (eventsRes.data || []) as { start_time: string; end_time: string; pool_area: string }[];
      // Only events that share the pool area or are 'full' block this slot.
      const blocking = events
        .filter((e) => e.pool_area === poolArea || e.pool_area === "full" || poolArea === "full")
        .map((e) => ({ start: toMin(e.start_time.slice(0, 5)), end: toMin(e.end_time.slice(0, 5)) }));

      const shifts = (shiftsRes.data || []) as {
        id: string;
        instructor_id: string;
        start_time: string;
        end_time: string;
      }[];

      setHasAnyShift(shifts.length > 0);

      const result: AvailableSlot[] = [];
      for (const shift of shifts) {
        const sStart = toMin(shift.start_time.slice(0, 5));
        const sEnd = toMin(shift.end_time.slice(0, 5));
        for (let t = sStart; t + lengthMin <= sEnd; t += stepMin) {
          const slotEnd = t + lengthMin;
          const conflict = blocking.some((b) => t < b.end && slotEnd > b.start);
          if (conflict) continue;
          result.push({
            instructorId: shift.instructor_id,
            instructorName: nameById.get(shift.instructor_id) || "Instructor",
            start: fromMin(t),
            end: fromMin(slotEnd),
            poolArea,
          });
        }
      }

      // Sort by instructor name, then start time
      result.sort((a, b) =>
        a.instructorName.localeCompare(b.instructorName) || a.start.localeCompare(b.start),
      );

      setSlots(result);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [date, lengthMin, stepMin, poolArea]);

  return { slots, loading, hasAnyShift };
}
