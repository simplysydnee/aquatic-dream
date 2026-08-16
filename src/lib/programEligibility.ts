// Age eligibility for the public /join flow only. Admin and front-desk flows
// keep full program choice and never call into this.

export type ProgramKey = "kid_group" | "private" | "adult_group";

export const ADULT_MIN_AGE = 18;

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

export type AgeGateKind = "adult_in_kids" | "minor_in_adult";

/**
 * Returns the mismatch between the swimmer's age and the chosen program, or
 * null when the pairing is allowed (or the DOB is not usable yet).
 *
 * Adults (18 and over) may book Private Swim; those lessons are tagged Adult
 * for staff. Only Small Group is kids only, since it groups swimmers by level
 * and age.
 */
export function programAgeMismatch(
  planKey: ProgramKey | null | undefined,
  dob: string | null | undefined,
  today: Date = new Date(),
): AgeGateKind | null {
  if (!planKey) return null;
  const age = ageFromDob(dob, today);
  if (age === null || age < 0) return null;
  const adult = isAdultAge(age);
  if (adult && planKey === "kid_group") return "adult_in_kids";
  if (!adult && planKey === "adult_group") return "minor_in_adult";
  return null;
}

/** Audience label shown on the program picker and the landing page cards. */
export const PROGRAM_AGE_LABELS: Record<ProgramKey, string> = {
  private: "Ages 3 and up",
  kid_group: "Ages 3 to 17",
  adult_group: "18 and over",
};

