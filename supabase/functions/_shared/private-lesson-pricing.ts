// Authoritative pricing for private / semi-private lessons used by all
// edge functions. Mirrors src/lib/privateLessonPricing.ts — keep both in sync.
// June 2026 promo: private = $50 for occurrences dated 2026-06-01..2026-06-30.

export const PRIVATE_REGULAR_PRICE = 65;
export const PRIVATE_JUNE_PROMO_PRICE = 50;
export const SEMI_PRIVATE_PRICE = 45;

export const JUNE_PROMO_START = "2026-06-01";
export const JUNE_PROMO_END = "2026-06-30";

export function isJunePromoDate(dateISO: string): boolean {
  if (!dateISO) return false;
  const d = String(dateISO).slice(0, 10);
  return d >= JUNE_PROMO_START && d <= JUNE_PROMO_END;
}

export function getPrivateLessonPrice(
  lessonType: string,
  occurrenceDateISO: string,
): number {
  if (lessonType === "semi_private") return SEMI_PRIVATE_PRICE;
  return isJunePromoDate(occurrenceDateISO)
    ? PRIVATE_JUNE_PROMO_PRICE
    : PRIVATE_REGULAR_PRICE;
}
