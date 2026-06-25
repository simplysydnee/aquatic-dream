// Single source of truth for private/semi-private lesson pricing.
// Promo: private lessons are $50 (normally $65) for any occurrence
// dated within [PROMO_START_DATE, PROMO_END_DATE]. Semi-private is
// always $45. To extend, shorten, or end the promo, change
// PROMO_END_DATE (and PROMO_START_DATE if needed) here AND in
// supabase/functions/_shared/private-lesson-pricing.ts. To rename
// the badge wording, change PROMO_LABEL in the same two files.

export const PRIVATE_REGULAR_PRICE = 65;
export const PRIVATE_PROMO_PRICE = 50;
export const SEMI_PRIVATE_PRICE = 45;

export const PROMO_START_DATE = "2026-06-01";
export const PROMO_END_DATE = "2026-08-31";
export const PROMO_LABEL = "Summer Special";

export type LessonType = "private" | "semi_private";

export function isPromoDate(dateISO: string): boolean {
  if (!dateISO) return false;
  const d = dateISO.slice(0, 10);
  return d >= PROMO_START_DATE && d <= PROMO_END_DATE;
}

export function getPrivateLessonPrice(
  lessonType: LessonType | string,
  occurrenceDateISO: string,
): number {
  if (lessonType === "semi_private") return SEMI_PRIVATE_PRICE;
  return isPromoDate(occurrenceDateISO)
    ? PRIVATE_PROMO_PRICE
    : PRIVATE_REGULAR_PRICE;
}

function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const PROMO_ACTIVE_FOR_TODAY = isPromoDate(todayISO());

export function promoCopy() {
  return {
    badge: `★ ${PROMO_LABEL}`,
    headline: `$${PRIVATE_PROMO_PRICE} per lesson (normally $${PRIVATE_REGULAR_PRICE})`,
    endsOn: PROMO_END_DATE,
  };
}
