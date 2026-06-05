// Single source of truth for private/semi-private lesson pricing.
// June 2026 promo: private lessons are $50 (normally $65) for any
// occurrence dated 2026-06-01 through 2026-06-30. Semi-private is
// always $45. Charge-time logic in edge functions mirrors this.

export const PRIVATE_REGULAR_PRICE = 65;
export const PRIVATE_JUNE_PROMO_PRICE = 50;
export const SEMI_PRIVATE_PRICE = 45;

export const JUNE_PROMO_START = "2026-06-01";
export const JUNE_PROMO_END = "2026-06-30";

export type LessonType = "private" | "semi_private";

export function isJunePromoDate(dateISO: string): boolean {
  if (!dateISO) return false;
  const d = dateISO.slice(0, 10);
  return d >= JUNE_PROMO_START && d <= JUNE_PROMO_END;
}

export function getPrivateLessonPrice(
  lessonType: LessonType | string,
  occurrenceDateISO: string,
): number {
  if (lessonType === "semi_private") return SEMI_PRIVATE_PRICE;
  return isJunePromoDate(occurrenceDateISO)
    ? PRIVATE_JUNE_PROMO_PRICE
    : PRIVATE_REGULAR_PRICE;
}

function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const JUNE_PROMO_ACTIVE_FOR_TODAY = isJunePromoDate(todayISO());
