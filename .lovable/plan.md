# Let adults book Private Swim

Adults can now choose either Adult Swim (small group of two) or Private Swim (one on one). The only remaining age rules: Small Group stays kids only, and Adult Swim stays 18 and over.

## What changes for a parent or adult swimmer on /join

- An 18+ date of birth with Private selected goes straight through. No block panel, no forced switch.
- An 18+ date of birth with Small Group still shows the existing panel offering Adult Swim or Private.
- An under 18 date of birth with Adult Swim still shows the panel pointing to Private or Small Group.
- Program cards read: Private Swim "All ages", Small Group "Ages 3 to 17", Adult Swim "18 and over".

## Rules kept

- Minimum age 3 for every program.
- Future dates, implausible dates, and dates that contradict a signed waiver are still refused at checkout.
- Admin and front desk flows stay ungated.
- The "Age check" flag on /admin/memberships stays, but stops flagging adults in Private. It keeps flagging swimmer name matching parent name and impossible dates.

## Technical notes

- `src/lib/programEligibility.ts`: `programAgeMismatch` returns `adult_in_kids` only for `kid_group`; Private is allowed at any age. `PROGRAM_AGE_LABELS.private` becomes "All ages".
- `supabase/functions/_shared/program-eligibility.ts`: same relaxation in `programEligibilityError`, with the message reworded to "Small Group is for ages 3 to 17. Adults join Adult Swim or Private Swim."
- `src/components/swim-enrollment/AgeGatePanel.tsx`: the adult copy offers both Adult Swim and Private instead of Adult Swim only.
- `src/pages/JoinMembership.tsx`: no logic change needed beyond the shared helper; the assessment path at line 551 already checks `kid_group` specifically.
- Copy updates on `src/pages/Index.tsx` and `src/pages/SwimLessons.tsx` for the Private card blurb.
- `src/pages/admin/MembershipsAdmin.tsx`: drop "adult in Private" from `needsAgeReview`; adjust the helper line about Adult Swim.
- Redeploy `create-membership-checkout`. No database or Stripe changes.
