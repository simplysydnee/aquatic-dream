import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { DEAD_STATUS_FILTER } from "@/lib/lessonBookingStatus";

export interface BlockSlot {
  instructorId: string;
  instructorName: string;
  blockId: string;
  blockNotes?: string | null;
  start: string; // "HH:MM"
  end: string;
  poolArea: string;
}

interface Options {
  lengthMin: number;
  stepMin?: number;
  poolArea?: string;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const fromMin = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const norm = (t: string) => t.slice(0, 5);

/**
 * Returns open slots derived from instructor_booking_blocks for a given date,
 * minus existing booking occurrences and conflicting pool events.
 */
export function useAvailableBlockSlots(
  date: Date | null,
  { lengthMin, stepMin = 15, poolArea = "shallow" }: Options,
) {
  const [slots, setSlots] = useState<BlockSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasAnyBlock, setHasAnyBlock] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!date) {
      setSlots([]);
      setHasAnyBlock(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const dateStr = format(date, "yyyy-MM-dd");
      const dow = date.getDay();

      const [blocksRes, instrRes, occsRes, eventsRes] = await Promise.all([
        supabase.rpc("get_public_booking_blocks", { _instructor_ids: null }),
        supabase.rpc("get_active_instructors_public"),
        supabase
          .from("lesson_booking_occurrences")
          .select("occurrence_date, status, start_time_override, end_time_override, instructor_override_id, lesson_bookings!inner(instructor_id, start_time, end_time)")
          .eq("occurrence_date", dateStr)
          .not("status", "in", DEAD_STATUS_FILTER),
        supabase
          .from("pool_events")
          .select("start_time, end_time, pool_area")
          .eq("event_date", dateStr),
      ]);

      if (cancelled) return;

      const allBlocks = (blocksRes.data as any[]) || [];

      const applies = (b: any) => {
        if (b.kind === "weekly") {
          if (b.day_of_week !== dow) return false;
          if (b.start_date && dateStr < b.start_date) return false;
          if (b.end_date && dateStr > b.end_date) return false;
          return true;
        }
        if (b.kind === "date_range") {
          if (b.start_date && dateStr < b.start_date) return false;
          if (b.end_date && dateStr > b.end_date) return false;
          if (b.day_of_week !== null && b.day_of_week !== dow) return false;
          return true;
        }
        return false;
      };

      const blocks = allBlocks.filter((b) => !b.is_blackout && applies(b));
      const blackoutsByInstr = new Map<string, { start: number; end: number }[]>();
      for (const b of allBlocks) {
        if (!b.is_blackout || !applies(b)) continue;
        const arr = blackoutsByInstr.get(b.instructor_id) || [];
        arr.push({ start: toMin(norm(b.start_time)), end: toMin(norm(b.end_time)) });
        blackoutsByInstr.set(b.instructor_id, arr);
      }

      setHasAnyBlock(blocks.length > 0);

      const instructors = (instrRes.data as { id: string; name: string }[]) || [];
      const nameById = new Map(instructors.map((i) => [i.id, i.name]));

      // Build "taken" intervals per instructor
      const takenByInstr = new Map<string, { start: number; end: number }[]>();
      for (const o of (occsRes.data as any[]) || []) {
        const b = o.lesson_bookings;
        const instId = o.instructor_override_id || b?.instructor_id;
        if (!instId) continue;
        const s = toMin(norm(o.start_time_override || b.start_time));
        const e = toMin(norm(o.end_time_override || b.end_time));
        const arr = takenByInstr.get(instId) || [];
        arr.push({ start: s, end: e });
        takenByInstr.set(instId, arr);
      }

      const blocking = ((eventsRes.data as any[]) || [])
        .filter((e) => e.pool_area === poolArea || e.pool_area === "full" || poolArea === "full")
        .map((e) => ({ start: toMin(norm(e.start_time)), end: toMin(norm(e.end_time)) }));

      const result: BlockSlot[] = [];
      const seen = new Set<string>();

      for (const blk of blocks) {
        const bStart = toMin(norm(blk.start_time));
        const bEnd = toMin(norm(blk.end_time));
        const brkS = blk.break_start_time ? toMin(norm(blk.break_start_time)) : null;
        const brkE = blk.break_end_time ? toMin(norm(blk.break_end_time)) : null;
        const taken = takenByInstr.get(blk.instructor_id) || [];
        const blackouts = blackoutsByInstr.get(blk.instructor_id) || [];

        for (let t = bStart; t + lengthMin <= bEnd; t += stepMin) {
          const slotEnd = t + lengthMin;
          if (brkS !== null && brkE !== null && t < brkE && slotEnd > brkS) continue;
          if (taken.some((x) => t < x.end && slotEnd > x.start)) continue;
          if (blocking.some((x) => t < x.end && slotEnd > x.start)) continue;
          if (blackouts.some((x) => t < x.end && slotEnd > x.start)) continue;

          const key = `${blk.instructor_id}|${t}`;
          if (seen.has(key)) continue;
          seen.add(key);

          result.push({
            instructorId: blk.instructor_id,
            instructorName: nameById.get(blk.instructor_id) || "Instructor",
            blockId: blk.id,
            blockNotes: blk.notes,
            start: fromMin(t),
            end: fromMin(slotEnd),
            poolArea: blk.pool_area || poolArea,
          });
        }
      }

      result.sort(
        (a, b) =>
          a.start.localeCompare(b.start) || a.instructorName.localeCompare(b.instructorName),
      );

      setSlots(result);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [date, lengthMin, stepMin, poolArea, reloadKey]);

  return { slots, loading, hasAnyBlock, refresh };
}
