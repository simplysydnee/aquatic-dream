// Short "Tue Aug 12" label for the first real lesson of a standing slot.
// Reuses the existing date rules only: firstLessonDate() picks the weekday on
// or after max(today PT, SEASON_START), and the closure-skip mirrors what
// buildMembershipOccurrenceRows() does when it generates occurrences.
import { firstLessonDate } from "./membership-pricing.ts";
import { fetchClosureDateSet } from "./closure-schedule.ts";

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const toIso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function formatFirstLessonLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${SHORT_DAYS[dow]} ${SHORT_MONTHS[m - 1]} ${d}`;
}

/**
 * First lesson date for a slot's weekday, skipping studio closures exactly the
 * way occurrence generation does. Returns null when the closure lookup or the
 * weekday is unusable so callers can fall back to plain day wording.
 */
export async function firstLessonDateForSlot(
  dayOfWeek: number | null | undefined,
): Promise<{ iso: string; label: string } | null> {
  const dow = Number(dayOfWeek);
  if (!Number.isInteger(dow) || dow < 0 || dow > 6) return null;

  try {
    const closureDates = await fetchClosureDateSet();
    const first = firstLessonDate(dow);
    let cursor = new Date(Date.UTC(first.y, first.m - 1, first.d));
    let guard = 0;
    let iso = toIso(first.y, first.m, first.d);
    while (closureDates.has(iso) && guard < 52) {
      cursor = new Date(cursor.getTime() + 7 * 86400000);
      iso = cursor.toISOString().slice(0, 10);
      guard += 1;
    }
    return { iso, label: formatFirstLessonLabel(iso) };
  } catch (e) {
    console.error("[first-lesson-date] lookup failed", e);
    return null;
  }
}
