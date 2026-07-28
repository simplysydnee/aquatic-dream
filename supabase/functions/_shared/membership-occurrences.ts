// Single source of truth for generating membership_occurrences rows from a
// standing slot. Used by checkout completion and by admin slot moves so both
// produce identical schedules.

export interface OccurrenceSlot {
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  instructor_id: string | null;
}

export interface OccurrenceRow {
  membership_id: string;
  occurrence_date: string;
  start_time: string | null;
  end_time: string | null;
  instructor_id: string | null;
  status: string;
}

/**
 * Build weekly occurrence rows for a membership starting on/after `startISO`,
 * skipping studio closure dates. Generates `count` real lessons.
 */
export function buildMembershipOccurrenceRows(args: {
  membershipId: string;
  slot: OccurrenceSlot;
  startISO: string;
  closureDates: Set<string>;
  count?: number;
}): OccurrenceRow[] {
  const { membershipId, slot, startISO, closureDates } = args;
  const count = args.count ?? 8;

  const [y, m, d] = startISO.split("-").map(Number);
  let cursor = new Date(Date.UTC(y, m - 1, d));
  const targetDow = Number(slot.day_of_week ?? 0);
  while (cursor.getUTCDay() !== targetDow) {
    cursor = new Date(cursor.getTime() + 86400000);
  }

  const rows: OccurrenceRow[] = [];
  let guard = 0;
  while (rows.length < count && guard < 52) {
    const iso = cursor.toISOString().slice(0, 10);
    if (!closureDates.has(iso)) {
      rows.push({
        membership_id: membershipId,
        occurrence_date: iso,
        start_time: slot.start_time,
        end_time: slot.end_time,
        instructor_id: slot.instructor_id,
        status: "scheduled",
      });
    }
    cursor = new Date(cursor.getTime() + 7 * 86400000);
    guard += 1;
  }

  return rows;
}
