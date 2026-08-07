# Aaron Sanchez private membership: what happened, and closing the gap

## What the records show

Membership `0e06f75f` (Private, Tuesday 5:30 PM, active, created Aug 7 3:17 AM, source `summer2026`):

- Swimmer on file: Aaron Sanchez, date of birth **2021-06-06**, which is age 5
- Parent on file: Aaron Sanchez, aarons1987@gmail.com, 209-543-2808
- The waiver signed at 3:16 AM (`15ff5ec0`) lists the same single swimmer with the same 2021-06-06 date of birth, signed as "Aaron Sanchez", emergency contact also Aaron Sanchez, relationship Parent/Guardian
- History: this email has booked private lessons for Valeria Sanchez several times, plus one June 23 private booking with the swimmer name "Aaron Sanchez" (that older table stores no date of birth)

So the age guard did not misfire. It was given a date of birth of a 5 year old and correctly allowed Private. The record is either a child who shares the father's name, or an adult who entered a false date of birth.

## The real gap

The age rule exists in one place only: `src/lib/programEligibility.ts`, called from the /join page in the browser. The server never re-checks it. `create-membership-checkout` validates only that `child_dob` parses as a date, not that the age matches the program. So a wrong or falsified date of birth, a stale value, or a direct API call all get through with no second line of defense, and nothing is recorded for staff to review later.

## What to build

1. **Server-side age enforcement.** Move the age rule into a shared edge function helper and call it in `create-membership-checkout` before any Stripe work: adult date of birth plus Private or Small Group is rejected, minor plus Adult Swim is rejected, with a clear message. Admin-originated requests (verified admin JWT, as the sandbox gate already distinguishes) stay ungated, matching the existing rule that front desk flows keep full program choice.

2. **Reject impossible or implausible dates of birth.** Future dates, dates over 100 years ago, and ages under the 3 year minimum are refused at the same checkpoint.

3. **Waiver and membership consistency check.** When a hold or waiver already carries a date of birth for that swimmer, compare it to the submitted one and refuse the mismatch rather than silently trusting the newer value.

4. **Flag for staff instead of trusting silently.** Add a light "age review" surface: on `/admin/memberships`, mark rows where the swimmer's first and last name exactly match the parent's first and last name, since that is the pattern this record shows and it is a cheap tell for an adult self-enrolling as a child. Staff can confirm or correct the date of birth inline. No automatic cancellation.

5. **Verify the Aaron Sanchez record itself.** Nothing is changed in the database as part of this work. Once staff confirm with the family whether the swimmer is a 5 year old or the adult, the record is corrected or moved to Adult Swim through normal admin actions.

## Technical notes

- New shared helper `supabase/functions/_shared/program-eligibility.ts` mirroring `src/lib/programEligibility.ts`, so browser and server share one rule set
- `create-membership-checkout` gains the age and date sanity checks just after the existing `plan_key` and `child_dob` validation, returning a 400 with a specific reason
- The parent/swimmer name-match flag is computed in the admin query, not stored, so no schema change is needed for it
- No changes to Stripe flow, webhook ordering, or existing memberships
