/** Date helpers for Staff Mode. The pool runs on Pacific time, tablets may not. */

const PACIFIC = "America/Los_Angeles";

/** Today's date in America/Los_Angeles as YYYY-MM-DD. */
export const todayPacific = (): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/** Shifts a YYYY-MM-DD date string by whole days without timezone drift. */
export const shiftDate = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

/** "Thursday, Aug 21" for a YYYY-MM-DD string. */
export const formatDateLabel = (dateStr: string): string => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
  });
};

/** "4:15 PM" from a Postgres time string like "16:15:00". */
export const formatTime = (time: string | null): string => {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${mStr} ${suffix}`;
};

/** "4:15 PM" from a timestamptz, rendered in Pacific. */
export const formatClockPacific = (iso: string): string =>
  new Date(iso).toLocaleTimeString("en-US", {
    timeZone: PACIFIC,
    hour: "numeric",
    minute: "2-digit",
  });

export const PROGRAM_LABELS: Record<string, string> = {
  private: "Private",
  kid_group: "Small Group",
  adult_group: "Adult Swim",
};

export const programLabel = (planKey: string | null): string =>
  (planKey && PROGRAM_LABELS[planKey]) || "Lesson";
