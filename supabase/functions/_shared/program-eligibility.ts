// Server-side mirror of src/lib/programEligibility.ts. The browser gate is a
// convenience; this is the enforcement. Keep the two in sync.

export type ProgramKey = "kid_group" | "private" | "adult_group";

export const ADULT_MIN_AGE = 18;
export const MIN_SWIMMER_AGE = 3;
export const MAX_PLAUSIBLE_AGE = 100;

/** Whole years old as of `today`. Returns null for an empty or unparseable DOB. */
export function ageFromDob(dob: string | null | undefined, today: Date = new Date()): number | null {
  if (!dob) return null;
  const iso = String(dob).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || !month || !day) return null;
  let age = today.getFullYear() - year;
  const beforeBirthday =
    today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

export function isAdultAge(age: number | null): boolean {
  return age !== null && age >= ADULT_MIN_AGE;
}

/**
 * Returns a parent-facing rejection reason, or null when the swimmer's date of
 * birth is usable and matches the program.
 */
export function programEligibilityError(
  planKey: ProgramKey,
  dob: string | null | undefined,
  today: Date = new Date(),
): string | null {
  const age = ageFromDob(dob, today);
  if (age === null) {
    return "Please enter the swimmer's date of birth as YYYY-MM-DD.";
  }
  if (age < 0) {
    return "That date of birth is in the future. Please check it and try again.";
  }
  if (age > MAX_PLAUSIBLE_AGE) {
    return "That date of birth does not look right. Please check it and try again.";
  }
  if (age < MIN_SWIMMER_AGE) {
    return `Swimmers must be at least ${MIN_SWIMMER_AGE} years old to join. Give us a call and we will help.`;
  }
  const adult = isAdultAge(age);
  if (adult && planKey !== "adult_group") {
    return "Swimmers 18 and over join Adult Swim. Private and Small Group are for ages 3 to 17.";
  }
  if (!adult && planKey === "adult_group") {
    return "Adult Swim is for swimmers 18 and over. Please choose Private or Small Group.";
  }
  return null;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const isoDay = (v: unknown) => String(v ?? "").slice(0, 10);

/**
 * When a signed waiver already carries a date of birth for this swimmer, the
 * submitted one has to match it. Returns a rejection reason or null.
 */
export function waiverDobMismatch(
  waiverSwimmers: unknown,
  firstName: string,
  lastName: string,
  submittedDob: string,
): string | null {
  if (!Array.isArray(waiverSwimmers)) return null;
  const match = waiverSwimmers.find(
    (s) =>
      s &&
      typeof s === "object" &&
      norm((s as Record<string, unknown>).first_name) === norm(firstName) &&
      norm((s as Record<string, unknown>).last_name) === norm(lastName),
  ) as Record<string, unknown> | undefined;
  if (!match) return null;
  const waiverDob = isoDay(match.dob);
  if (!waiverDob) return null;
  if (waiverDob === isoDay(submittedDob)) return null;
  return "The date of birth does not match the signed waiver for this swimmer. Please give us a call so we can correct it.";
}
