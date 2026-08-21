/** Pacific-time date helpers for staff mode. Never use toISOString for dates. */

const PACIFIC = "America/Los_Angeles";

/** Today in Pacific time as YYYY-MM-DD. */
export const todayPacific = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC }).format(new Date());

/** Shift a YYYY-MM-DD date string by whole days without timezone drift. */
export const shiftDate = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(dt);
};

/** Human label for a YYYY-MM-DD date string, e.g. "Thu, Aug 20". */
export const formatDateLabel = (dateStr: string): string => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
};

/** Format a Postgres time value (HH:MM:SS) as e.g. "4:30 PM". */
export const formatTimeLabel = (time: string | null): string => {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${mStr} ${suffix}`;
};

/** Format a timestamp (e.g. locked_until) as a Pacific clock time. */
export const formatClockPacific = (iso: string): string =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
