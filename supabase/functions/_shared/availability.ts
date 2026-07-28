// Shared helpers for validating that proposed lesson occurrences fall
// inside a non-blackout instructor_booking_blocks window. Used by the
// admin + public private-booking edge functions to prevent recurring
// bookings from generating occurrences on days the instructor doesn't
// actually work (which the slot picker already filters, but a stale
// client cache or a hand-rolled API call could still bypass).

export type BookingBlock = {
  instructor_id: string;
  kind: "weekly" | "date_range" | string;
  day_of_week: number | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string;
  end_time: string;
  is_blackout: boolean;
};

export type ProposedOccurrence = {
  instructor_id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM or HH:MM:SS
  end_time: string;
};

export type AvailabilityFailure = {
  instructor_id: string;
  date: string;
  start_time: string;
  end_time: string;
  reason: "no_availability" | "blackout";
};

function normTime(t: string): string {
  return (t || "").slice(0, 5);
}

function dowOf(dateISO: string): number {
  // Use UTC noon to avoid TZ edge cases
  return new Date(dateISO + "T12:00:00Z").getUTCDay();
}

function dateInBlockRange(date: string, b: BookingBlock): boolean {
  if (b.start_date && date < b.start_date) return false;
  if (b.end_date && date > b.end_date) return false;
  return true;
}

function blockMatchesDow(b: BookingBlock, dow: number): boolean {
  if (b.kind === "weekly") return b.day_of_week === dow;
  if (b.kind === "date_range") return b.day_of_week === null || b.day_of_week === dow;
  return false;
}

/**
 * Validate a set of proposed occurrences against an instructor's
 * booking blocks. Returns an empty array when every occurrence falls
 * inside at least one availability block (matching DOW + date range +
 * time window) and overlaps no blackout block.
 */
export function validateOccurrencesAgainstBlocks(
  proposed: ProposedOccurrence[],
  blocks: BookingBlock[],
): AvailabilityFailure[] {
  const availability = blocks.filter((b) => !b.is_blackout);
  const blackouts = blocks.filter((b) => b.is_blackout);
  const failures: AvailabilityFailure[] = [];

  for (const o of proposed) {
    const dow = dowOf(o.date);
    const oStart = normTime(o.start_time);
    const oEnd = normTime(o.end_time);

    const hasAvailability = availability.some((b) => {
      if (b.instructor_id !== o.instructor_id) return false;
      if (!dateInBlockRange(o.date, b)) return false;
      if (!blockMatchesDow(b, dow)) return false;
      return normTime(b.start_time) <= oStart && normTime(b.end_time) >= oEnd;
    });

    if (!hasAvailability) {
      failures.push({
        instructor_id: o.instructor_id,
        date: o.date,
        start_time: oStart,
        end_time: oEnd,
        reason: "no_availability",
      });
      continue;
    }

    const blackoutHit = blackouts.some((b) => {
      if (b.instructor_id !== o.instructor_id) return false;
      if (!dateInBlockRange(o.date, b)) return false;
      if (!blockMatchesDow(b, dow)) return false;
      return oStart < normTime(b.end_time) && oEnd > normTime(b.start_time);
    });

    if (blackoutHit) {
      failures.push({
        instructor_id: o.instructor_id,
        date: o.date,
        start_time: oStart,
        end_time: oEnd,
        reason: "blackout",
      });
    }
  }

  return failures;
}

export function formatAvailabilityError(
  failures: AvailabilityFailure[],
  instructorName?: string,
): string {
  const who = instructorName?.trim() || "Instructor";
  const describe = (f: AvailabilityFailure) =>
    `${f.date} at ${f.start_time}-${f.end_time}`;
  const noAvail = failures.filter((f) => f.reason === "no_availability").map(describe);
  const blackout = failures.filter((f) => f.reason === "blackout").map(describe);
  const parts: string[] = [];
  if (noAvail.length) {
    parts.push(`${who} has no availability on ${noAvail.join(", ")}`);
  }
  if (blackout.length) {
    parts.push(`${who} is closed on ${blackout.join(", ")}`);
  }
  return parts.join(". ");
}
