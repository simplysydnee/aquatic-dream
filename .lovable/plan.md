## Goal

For returning families re-enrolling an existing swimmer (Case 1):
1. Don't show session periods the swimmer is already enrolled in (e.g. if they're in Session 1, only Session 2 shows).
2. Before the session picker, ask the parent whether they want to stay at the same level or move up to the next one.

## Changes

### 1. Extend the returning-family lookup (DB)

Update `public.get_returning_family_by_email(_email)` so each swimmer in the returned `swimmers` array also includes `enrolled_period_ids: uuid[]` — the distinct `session_period_id`s from active enrollments (`status IN ('confirmed','enrolled','pending_payment')`) joined through `swim_sessions`.

### 2. Frontend types

`src/components/swim-enrollment/ReturningFamilyEntry.tsx`
- Add `enrolled_period_ids: string[]` to `ReturningSwimmer`.

### 3. Add level-choice step

`src/pages/SwimEnrollment.tsx`
- New step `"level_choice"` in the `Step` union, inserted between picking a returning swimmer and `"session"`.
- New small inline component `ReturningLevelChoice` (or inline JSX) that shows:
  - "Continue at **{currentLevelName}**"
  - "Move up to **{nextLevelName}**" (only when there is a next level; Green has no move-up)
- Level order: `white → red → yellow → blue → green`.
- On select, set `level` to the chosen value then advance to `"session"`.
- Track `excludePeriodIds: string[]` in state, sourced from the picked swimmer's `enrolled_period_ids`. Pass into `SessionPicker`.
- `handlePickExistingSwimmer`: instead of jumping straight to `"session"`, jump to `"level_choice"` when a `last_level` is known. Store `excludePeriodIds`.

### 4. Filter session periods in `SessionPicker`

`src/components/swim-enrollment/SessionPicker.tsx`
- Accept new optional prop `excludePeriodIds?: string[]`.
- After computing `activeSessions`, drop any whose `session_period_id` is in `excludePeriodIds`.
- If everything is filtered out, show a friendly empty state ("You're already enrolled in every open session at this level — try moving up a level") with a Back button that returns to the level choice.

### 5. Progress indicator

For `flow === "case1"`, the steps become: **Level → Session → Payment → Confirmed** (was Session → Payment → Confirmed). `stepKeys` updated to match.

## Out of scope

- No changes to admin views.
- No changes to Case 2 (new swimmer / known parent) or the new-family flow.
- Move-up does NOT re-run the skill assessment; it's an explicit parent choice and the instructor can reassign later per existing policy.
