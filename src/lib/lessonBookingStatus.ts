/**
 * Single source of truth for deciding whether a private / semi-private lesson
 * occurrence is a REAL booking that should appear on schedules, rosters,
 * check-in and billing.
 *
 * Background: self-serve checkout creates the booking rows BEFORE the parent
 * saves a card. If they abandon the flow, the rows used to linger forever as
 * `pending_card` and printed as real lessons. Those are now swept to
 * `abandoned` by the `sweep-abandoned-bookings` job.
 *
 * Admin-created bookings are never treated as abandoned: the front desk placed
 * the slot on purpose and simply needs to collect a card in person.
 */

/** Grace period a self-serve checkout may hold a slot before it is abandoned. */
export const STALE_PENDING_MS = 15 * 60 * 1000;

/** Occurrence / booking statuses that must never show as a real lesson. */
export const DEAD_STATUSES = ["cancelled", "abandoned"] as const;

/** PostgREST filter value, e.g. `.not("status", "in", DEAD_STATUS_FILTER)`. */
export const DEAD_STATUS_FILTER = "(cancelled,abandoned)";

export const isAdminBookingSource = (source?: string | null): boolean =>
  source === "admin" || source === "admin_manual";

/**
 * An admin-placed slot that still needs a card collected at the front desk.
 * These ARE real, confirmed lessons and must stay on the schedule.
 */
export const needsCardAtDesk = (args: {
  bookingStatus?: string | null;
  bookingSource?: string | null;
}): boolean =>
  args.bookingStatus === "pending_card" && isAdminBookingSource(args.bookingSource);

/** Label shown wherever an admin hold is missing a card. */
export const CARD_AT_DESK_LABEL = "Card needed at desk";

const isDead = (status?: string | null): boolean =>
  status === "cancelled" || status === "abandoned";

/**
 * True when the occurrence should be shown as a real booked lesson.
 * Pass the occurrence status plus its parent booking's status/source/created_at.
 */
export const isRealLessonOccurrence = (args: {
  occurrenceStatus?: string | null;
  bookingStatus?: string | null;
  bookingSource?: string | null;
  createdAt?: string | null;
  now?: number;
}): boolean => {
  if (isDead(args.occurrenceStatus) || isDead(args.bookingStatus)) return false;
  if (args.occurrenceStatus !== "pending_card" && args.bookingStatus !== "pending_card") {
    return true;
  }
  // Admin holds always count as booked.
  if (isAdminBookingSource(args.bookingSource)) return true;
  const created = args.createdAt ? new Date(args.createdAt).getTime() : 0;
  return (args.now ?? Date.now()) - created <= STALE_PENDING_MS;
};
