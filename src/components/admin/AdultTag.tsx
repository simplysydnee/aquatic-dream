import { ageFromDob, ADULT_MIN_AGE } from "@/lib/programEligibility";

type Props = {
  /** Swimmer date of birth, ISO or null. */
  dob?: string | null;
  /** Membership plan key; adult_group is always an adult lesson. */
  planKey?: string | null;
  className?: string;
};

/** True when the swimmer is 18 or over, or the plan is Adult Swim. */
export const isAdultSwimmer = (dob?: string | null, planKey?: string | null): boolean => {
  if (planKey === "adult_group") return true;
  const age = ageFromDob(dob);
  return age !== null && age >= ADULT_MIN_AGE;
};

/** Small chip marking a lesson as an adult lesson, for staff and instructors. */
export const AdultTag = ({ dob, planKey, className = "" }: Props) => {
  if (!isAdultSwimmer(dob, planKey)) return null;
  return (
    <span
      title="Adult swimmer (18 or over)"
      className={`inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary align-middle ${className}`}
    >
      Adult
    </span>
  );
};

export default AdultTag;
