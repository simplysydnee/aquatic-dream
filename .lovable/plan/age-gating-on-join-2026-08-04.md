# Age gating on /join

## Where DOB is captured today (answer first)

Read of `src/pages/JoinMembership.tsx` (steps: 1 program, 2 slot, 3 info, 4 waiver, 5 consent, 6 review, 7 checkout, 8 success):

- Program is always chosen first, at step 1.
- Small Group: the Find Your Spot assessment runs immediately after the program tile is tapped, still inside step 1, and `handleAssessmentComplete(level, age, dob)` sets `childDob` before the slot picker. So for Small Group a usable DOB exists before step 2.
- Private Swim and Adult Swim: no assessment. DOB is first typed at step 3, in the swimmer/your-info form (`childDob`, date input), after the program and the slot are already chosen.
- Phone holds (`/join?hold=...`) jump straight to step 3 with the program and slot fixed, so DOB there is also step 3.

Net: DOB always arrives after program selection, and for two of three programs after slot selection too. The gate therefore has to fire on DOB entry/change and be able to send the swimmer back to a different program, which is what the switch flow below does.

## The rule

`ageOn(dob, today) >= 18` -> Adult Swim only. Under 18 -> Private Swim or Small Group only. Age computed as of today, client side, no stored age.

## What fires where

1. Small Group assessment completion: if the DOB from the assessment makes the swimmer 18+, show the block panel instead of advancing to the slot picker.
2. Step 3 DOB field (all programs, including hold arrivals): on change, evaluate. On mismatch the step-3 form is replaced by the block panel and Continue is disabled, so there is no way to proceed in the wrong program.

## The block panel

Adult in a kids program:

> Swimmers 18 and over enroll in Adult Swim. It is $140 a month instead of $200, runs Tuesday evenings at 7:15, and is a small group of two adults.

Primary button "Switch to Adult Swim". Secondary link back to the program picker.

Under 18 in Adult Swim: same panel shape, reversed copy, with buttons for Private Swim and Small Group.

## Carrying the data across the switch

Switching only changes `plan`, clears `slot`, clears `swimLevel` when leaving Small Group, and moves to step 2. Everything already typed stays in the existing `form` state and `childDob`: names, email, phone, first-time answer, medical answers, notes, plus `waiverId` / `waiverOnFile` and the consent checkboxes. Nothing is reset, so nothing is retyped. Going into Small Group from Adult Swim still needs a level, so that one route opens the assessment with the DOB prefilled; the assessment itself is not modified.

## Phone holds get released, not orphaned

If the swimmer arrived on `/join?hold=<token>` and the DOB disqualifies them from the held program, switching must free the slot. The block panel says so plainly, for example: "We are releasing the held Tuesday 4:15 Private Swim spot, since the program is changing."

On the switch the page calls the existing `release-membership-hold` edge function with the token, then clears `holdToken`, `holdState`, `holdHeldUntil`, `holdWaiverId` and the `?hold=` query param, exactly the same teardown `chooseSlot` already performs when a held parent picks a different slot. The hold flips to `cancelled` and the slot returns to circulation immediately. Data already carried over from the hold (name, phone, email, waiver id resolved for that swimmer) stays in form state. No new edge function and no schema change.

## Adult Swim full

The switch lands on the normal Adult Swim slot picker, which already renders full slots as "Class full" with a "Join waitlist" button and the existing waitlist capture dialog. If Adult Swim has no slots at all, the panel shows the waitlist capture directly rather than an empty list, so there is no dead end.

## Copy

- Join picker subtitles: Private Swim "One-on-one coaching · Ages 3 to 17", Small Group "... · Ages 3 to 17", Adult Swim "Adult group class · 2 adults max · 18 and over".
- `src/pages/Index.tsx` program cards: private blurb changes from "One-on-one · Ages 3+" to "One-on-one · Ages 3 to 17"; Small Group gains "Ages 3 to 17"; Adult Swim gains "18 and over".

## Out of scope, untouched

Admin booking, phone-hold creation, and front-desk flows keep full program choice. No pricing, proration, consent, checkout, or assessment logic changes. No schema change, no age column, no writes to any existing membership.

## Technical notes

- New small helper for age-from-DOB and program eligibility, kept alongside the join page (e.g. `src/lib/programEligibility.ts`), exported named.
- New presentational component for the block panel under `src/components/swim-enrollment/`.
- Purely frontend and presentational; no edge function or SQL work.

## Verification

Manual pass on /join covering: 18-year-old DOB blocks Private Swim and offers Adult Swim; switch preserves every entered field; 17-year-old proceeds in Private Swim unchanged; 15-year-old in Adult Swim is redirected to the kids programs; Adult Swim full shows the waitlist; admin booking can still place an adult in a private lesson; the existing adult private membership row is untouched.
