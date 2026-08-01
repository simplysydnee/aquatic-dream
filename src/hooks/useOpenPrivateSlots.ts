// Shared open-private-slot computation.
// Extracted from useCalendarData so any range (front desk booking page,
// calendar day/week view) uses one identical availability rule:
// instructor booking blocks − taken private occurrences − blackouts.
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { DEAD_STATUS_FILTER, isRealLessonOccurrence } from "@/lib/lessonBookingStatus";

export interface OpenPrivateSlot {
  instructor_id: string;
  instructor_name: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  pool_area: string;
  default_lesson_type: string;
}

const addMin = (t: string, m: number): string => {
  const [h, mm] = t.split(":").map(Number);
  const total = h * 60 + mm + m;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const toMin = (t: string) => {
  const [h, mm] = t.split(":").map(Number);
  return h * 60 + (mm || 0);
};

const blockApplies = (blk: Record<string, unknown>, ds: string, dow: number): boolean => {
  const kind = blk.kind as string;
  const dayOfWeek = blk.day_of_week as number | null;
  const startDate = blk.start_date as string | null;
  const endDate = blk.end_date as string | null;
  if (kind === "weekly" && dayOfWeek !== dow) return false;
  if (startDate && ds < startDate) return false;
  if (endDate && ds > endDate) return false;
  if (kind === "date_range" && dayOfWeek !== null && dayOfWeek !== dow) return false;
  return true;
};

/**
 * Pure slot composition. `takenKeys` holds `instructorId|date|HH:MM` entries
 * that are already booked.
 */
export function composeOpenPrivateSlots(input: {
  rangeStart: string;
  rangeEnd: string;
  blocks: Record<string, unknown>[];
  instructorNames: Map<string, string>;
  takenKeys: Set<string>;
}): OpenPrivateSlot[] {
  const { rangeStart, rangeEnd, blocks: allBlocks, instructorNames, takenKeys } = input;
  const blocks = allBlocks.filter((b) => !b.is_blackout);
  const blackouts = allBlocks.filter((b) => b.is_blackout);
  const open: OpenPrivateSlot[] = [];
  const fromD = new Date(rangeStart + "T00:00:00");
  const toD = new Date(rangeEnd + "T00:00:00");

  for (const d = new Date(fromD); d <= toD; d.setDate(d.getDate() + 1)) {
    const ds = format(d, "yyyy-MM-dd");
    const dow = d.getDay();
    const blackoutsToday = blackouts
      .filter((b) => blockApplies(b, ds, dow))
      .map((b) => ({
        instructor_id: b.instructor_id as string,
        start: toMin((b.start_time as string).slice(0, 5)),
        end: toMin((b.end_time as string).slice(0, 5)),
      }));

    for (const blk of blocks) {
      if (!blockApplies(blk, ds, dow)) continue;
      const instructorId = blk.instructor_id as string;
      const slotMinutes = blk.slot_minutes as number;
      let t = (blk.start_time as string).slice(0, 5);
      const end = (blk.end_time as string).slice(0, 5);
      const bs = blk.break_start_time ? (blk.break_start_time as string).slice(0, 5) : null;
      const be = blk.break_end_time ? (blk.break_end_time as string).slice(0, 5) : null;
      while (addMin(t, slotMinutes) <= end) {
        const se = addMin(t, slotMinutes);
        if (bs && be && t < be && se > bs) { t = be; continue; }
        const sMin = toMin(t);
        const eMin = toMin(se);
        const blackedOut = blackoutsToday.some(
          (bo) => bo.instructor_id === instructorId && sMin < bo.end && eMin > bo.start,
        );
        const key = `${instructorId}|${ds}|${t}`;
        if (!takenKeys.has(key) && !blackedOut) {
          open.push({
            instructor_id: instructorId,
            instructor_name: instructorNames.get(instructorId) || "Instructor",
            slot_date: ds,
            start_time: t,
            end_time: se,
            slot_minutes: slotMinutes,
            pool_area: (blk.pool_area as string) || "shallow",
            default_lesson_type: (blk.default_lesson_type as string) || "private",
          });
        }
        t = se;
      }
    }
  }

  // Dedupe overlapping blocks
  const seen = new Set<string>();
  return open.filter((s) => {
    const k = `${s.instructor_id}|${s.slot_date}|${s.start_time}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Fetches and computes open private slots for an arbitrary date range. */
export function useOpenPrivateSlots(startDateStr: string, endDateStr: string) {
  const [slots, setSlots] = useState<OpenPrivateSlot[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    const [occRes, blocksRes, instructorsRes] = await Promise.all([
      supabase
        .from("lesson_booking_occurrences")
        .select("id, occurrence_date, status, created_at, start_time_override, instructor_override_id, lesson_bookings!inner(instructor_id, start_time, status, booking_source)")
        .gte("occurrence_date", startDateStr)
        .lte("occurrence_date", endDateStr)
        .not("status", "in", DEAD_STATUS_FILTER),
      supabase.rpc("get_public_booking_blocks", { _instructor_ids: null }),
      supabase.rpc("get_active_instructors_public"),
    ]);

    const now = Date.now();
    const takenKeys = new Set<string>();
    for (const o of ((occRes.data as unknown as Record<string, any>[]) || [])) {
      const b = o.lesson_bookings;
      if (!isRealLessonOccurrence({
        occurrenceStatus: o.status,
        bookingStatus: b?.status,
        bookingSource: b?.booking_source,
        createdAt: o.created_at,
        now,
      })) continue;
      const instructorId = o.instructor_override_id || b?.instructor_id;
      if (!instructorId) continue;
      const start = (o.start_time_override || b?.start_time || "").slice(0, 5);
      takenKeys.add(`${instructorId}|${o.occurrence_date}|${start}`);
    }

    const instructorNames = new Map<string, string>(
      ((instructorsRes.data as unknown as { id: string; name: string }[]) || []).map((i) => [i.id, i.name]),
    );

    setSlots(composeOpenPrivateSlots({
      rangeStart: startDateStr,
      rangeEnd: endDateStr,
      blocks: (blocksRes.data as unknown as Record<string, unknown>[]) || [],
      instructorNames,
      takenKeys,
    }));
    setLoading(false);
  }, [startDateStr, endDateStr]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  return { slots, loading, refetch: fetchSlots };
}
