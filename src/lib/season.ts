// Single source of truth for the membership season start on the frontend.
// Mirrors SEASON_START in supabase/functions/_shared/membership-pricing.ts.

export const SEASON_START_DATE = "2026-08-17";

export const SEASON_START_LABEL = "Monday, August 17";

/** True once the season has begun (local date comparison, YYYY-MM-DD). */
export function isSeasonStarted(now: Date = new Date()): boolean {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}` >= SEASON_START_DATE;
}
