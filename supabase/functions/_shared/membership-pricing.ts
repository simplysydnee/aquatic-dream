// Shared proration/quote helper for membership pricing.
// Both `create-membership-checkout` and `get-membership-quote` MUST use this
// so what the parent sees on the Review screen matches what Stripe charges.

export const SEASON_START = "2026-08-17";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

function todayPTParts(): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

// First occurrence of `dow` (0=Sun..6=Sat) on/after max(today PT, SEASON_START).
export function firstLessonDate(dow: number): { y: number; m: number; d: number } {
  const today = todayPTParts();
  const [sy, sm, sd] = SEASON_START.split("-").map(Number);
  const todayNum = today.y * 10000 + today.m * 100 + today.d;
  const seasonNum = sy * 10000 + sm * 100 + sd;
  const start = todayNum >= seasonNum ? today : { y: sy, m: sm, d: sd };
  let { y, m, d } = start;
  for (let i = 0; i < 7; i++) {
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (wd === dow) return { y, m, d };
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    y = next.getUTCFullYear();
    m = next.getUTCMonth() + 1;
    d = next.getUTCDate();
  }
  return { y, m, d };
}

export function weekdayCountsForMonth(
  year: number,
  month: number,
  fromDay: number,
  dow: number,
): { total: number; remaining: number } {
  const daysInMonth = new Date(year, month, 0).getDate();
  let total = 0;
  let remaining = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (wd === dow) {
      total++;
      if (day >= fromDay) remaining++;
    }
  }
  return { total, remaining };
}

// Unix seconds for the 1st of the month AFTER (year, month) at 08:00 UTC (~midnight PT).
export function unixFirstOfMonthAfter(year: number, month: number): number {
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  return Math.floor(Date.UTC(nextY, nextM - 1, 1, 8, 0, 0) / 1000);
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export interface MembershipQuote {
  monthlyCents: number;
  firstChargeCents: number;
  firstLessonDate: string;           // YYYY-MM-DD
  firstLessonLabel: string;          // "Monday, August 17"
  billingStart: string;              // YYYY-MM-DD (the 1st of the month AFTER ref_month)
  billingStartLabel: string;         // "September 1"
  billingAnchorUnix: number;         // for Stripe billing_cycle_anchor
  lessonsCovered: number;            // remaining lessons in ref_month
  totalLessonsInMonth: number;
  refMonthName: string;              // e.g. "August"
  refMonth: number;                  // 1-12
  refYear: number;
}

export function computeMembershipQuote(dow: number, monthlyPriceCents: number): MembershipQuote {
  const first = firstLessonDate(dow);
  const { total, remaining } = weekdayCountsForMonth(first.y, first.m, first.d, dow);
  const firstChargeCents =
    total > 0 && remaining > 0
      ? Math.round((monthlyPriceCents * remaining) / total)
      : 0;
  const anchorUnix = unixFirstOfMonthAfter(first.y, first.m);
  const anchorDate = new Date(anchorUnix * 1000);
  const anchorY = anchorDate.getUTCFullYear();
  const anchorM = anchorDate.getUTCMonth() + 1;
  const anchorD = anchorDate.getUTCDate();
  const weekday = new Date(Date.UTC(first.y, first.m - 1, first.d)).getUTCDay();

  return {
    monthlyCents: monthlyPriceCents,
    firstChargeCents,
    firstLessonDate: `${first.y}-${pad(first.m)}-${pad(first.d)}`,
    firstLessonLabel: `${WEEKDAY_NAMES[weekday]}, ${MONTH_NAMES[first.m - 1]} ${first.d}`,
    billingStart: `${anchorY}-${pad(anchorM)}-${pad(anchorD)}`,
    billingStartLabel: `${MONTH_NAMES[anchorM - 1]} ${anchorD}`,
    billingAnchorUnix: anchorUnix,
    lessonsCovered: remaining,
    totalLessonsInMonth: total,
    refMonthName: MONTH_NAMES[first.m - 1],
    refMonth: first.m,
    refYear: first.y,
  };
}
