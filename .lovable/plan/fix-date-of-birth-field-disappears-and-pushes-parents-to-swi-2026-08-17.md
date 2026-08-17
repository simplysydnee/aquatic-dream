# Fix: date of birth field disappears and pushes parents to "switch programs"

## What the customer hit

Bhanuprett's hold (Tue 7:15 PM) is an **Adult Swim** hold. On the /join info step, the age check runs on **every keystroke / every wheel tick** of the date of birth field. The moment the in-progress value reads as under 18, the entire info form is replaced by the "switch programs" panel, so the field vanishes before they can finish typing the real birth year.

On a phone this is guaranteed to fire: the native date picker starts on today's date, which is age 0, so the panel appears as soon as they touch the field. Hence "each time we try".

Same failure mode in reverse on Small Group holds: an in-progress year that reads as 18+ swaps the form out.

## The fix

1. Stop swapping the form out mid-entry. On the info step, always keep the date of birth field mounted.
2. Evaluate the age gate only against a **settled** value: when the field loses focus, or when the parent presses Continue, and only when the date is complete and plausible (year 1900 to today).
3. When there is a real mismatch, show it as an inline notice under the date of birth field with the "Switch to ..." button, instead of hiding everything. The parent can correct a typo or switch, their choice.
4. Keep Continue blocked while a settled mismatch stands, so nobody can pay into the wrong program.
5. Leave the step 1 (program picker) age gate as is, and leave admin and front desk flows untouched.

## Follow up for this family

Their hold is now cancelled and expired. After the fix ships, send Bhanuprett a fresh Adult Swim hold link for the same Tue 7:15 PM slot.

## Technical notes

- `src/pages/JoinMembership.tsx`: `ageMismatch` currently derives straight from `childDob` on every render and gates the step 3 block (`{step === 3 && plan && ageMismatch && ...}` vs `{step === 3 && plan && !ageMismatch && ...}`). Replace with a `settledDob` state written on blur / Continue, feed that to `programAgeMismatch`, render `AgeGatePanel` inline below the field rather than as a whole-step replacement, and add the settled mismatch to `canContinueStep3`.
- `src/lib/programEligibility.ts`: add a completeness guard so out-of-range years (before 1900 or in the future) return `null` rather than a mismatch.
- No schema, edge function, or Stripe changes.
