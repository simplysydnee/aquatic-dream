// Authoritative pricing for private / semi-private lessons used by all
// edge functions. Mirrors src/lib/privateLessonPricing.ts — keep both in sync.
// Promo: private = $50 for occurrences dated within
// [PROMO_START_DATE, PROMO_END_DATE]. To extend/shorten/end the promo,
// change PROMO_END_DATE here AND in src/lib/privateLessonPricing.ts.

export const PRIVATE_REGULAR_PRICE = 65;
export const PRIVATE_PROMO_PRICE = 50;
export const SEMI_PRIVATE_PRICE = 45;

export const PROMO_START_DATE = "2026-06-01";
export const PROMO_END_DATE = "2026-08-31";
export const PROMO_LABEL = "Summer Special";

export function isPromoDate(dateISO: string): boolean {
  if (!dateISO) return false;
  const d = String(dateISO).slice(0, 10);
  return d >= PROMO_START_DATE && d <= PROMO_END_DATE;
}

export function getPrivateLessonPrice(
  lessonType: string,
  occurrenceDateISO: string,
): number {
  // Legacy rows use "semi-private"; newer rows use "semi_private".
  const normalized = String(lessonType || "").replace(/-/g, "_");
  if (normalized === "semi_private") return SEMI_PRIVATE_PRICE;
  return isPromoDate(occurrenceDateISO)
    ? PRIVATE_PROMO_PRICE
    : PRIVATE_REGULAR_PRICE;
}

