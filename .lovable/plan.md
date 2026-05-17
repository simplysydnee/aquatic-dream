## Goal

Admins can reliably move a swimmer from one class to another from both **Class Roster** and **Swim Enrollments**, including changing the swimmer's level when the new class is at a different level.

## What's wrong today

- **Class Roster** has a move dialog, but:
  - It only updates `session_id`. The swimmer's `swim_level` stays the same, so moving (e.g.) a "white" swimmer into a "yellow" class leaves them visually mismatched and they can appear to "snap back" under their old level grouping in some filter views — looks like the move didn't happen.
  - No capacity check — silently lets you put a 4th swimmer in a 3-seat class.
  - The "new session" dropdown lists every session with no filtering / search, easy to pick the wrong one.
  - The update call has no `.select()` and no surfaced error detail beyond `error.message`, so a silent RLS or constraint failure would be near-invisible.
- **Swim Enrollments** has no move action at all.

## Shared "Move Swimmer" dialog (new component)

Create `src/components/admin/MoveSwimmerDialog.tsx` used by both pages.

Inputs: `enrollment`, `sessions[]`, `periods[]`, `enrollmentsBySession` (for live counts), `onMoved()`.

UI:
1. Header: "Move {child_name} (currently {currentClassLabel})"
2. **Target class** — searchable Select grouped by session period, each row shows: period · day · time · level · `count/max`, and a "FULL" pill when at capacity. Excludes the current `session_id`.
3. **Level** — Select prefilled with the swimmer's current `swim_level`. When the admin picks a target class whose level differs, show an inline note: "This class is {targetLevel}. Update {child}'s level too?" with a one-click "Match class level" button that sets the Level select to the target's level. Admin can still pick any of the 5 levels independently.
4. Capacity warning banner if target is full: "This class is at 3/3. Moving will put it at 4/3." Confirm button changes to "Move anyway".
5. Optional "Notes" textarea appended to the enrollment's `notes` ("Moved from X to Y on {date} by admin" — append, not overwrite).
6. Confirm button performs:
   ```
   UPDATE swim_enrollments
      SET session_id = :newSessionId,
          swim_level = :chosenLevel,
          notes      = :mergedNotes,
          updated_at = now()
    WHERE id = :enrollmentId
   ```
   uses `.select().single()` so a 0-row result throws a clear error toast. On success → toast "Moved {name} to {newClassLabel}" → `onMoved()` refetch.

No payment / Stripe changes. Status, fees, agreements, and history stay intact.

## Class Roster wiring

Replace the existing inline move dialog in `src/pages/admin/ClassRosterAdmin.tsx` with `<MoveSwimmerDialog />`. Pass live `enrollments` so capacity counts are accurate. Remove the local `moveOpen`/`newSessionId` state and `handleMoveSwimmer`.

## Swim Enrollments wiring

In `src/pages/admin/SwimEnrollmentsAdmin.tsx`, add an `ArrowRightLeft` icon button on each enrollment row (all three tabs that render rows — same lookup pattern as the existing edit/cancel actions) that opens the shared `<MoveSwimmerDialog />`. Wire `onMoved` to the existing refetch.

## Out of scope

- No DB migration (RLS already allows authenticated updates; no schema change needed).
- No edge-function changes.
- Refunds, payment status, instructor reassignment, and class-date changes are untouched.
- Public enrollment flow untouched.

## Risk check

- Additive UI only on Swim Enrollments.
- Class Roster swap replaces a broken dialog with a working one with the same DB write surface (`UPDATE swim_enrollments` by id). Adds `swim_level` + `notes` to the updated columns — both are existing nullable/defaulted columns the admin already edits elsewhere (e.g. EditSwimmerDialog).
- `.select().single()` makes silent failures loud — no behavior change on success.
- Capacity override is admin-confirmed, matching the "Warn but allow" choice. The 3-seat rule has never been DB-enforced, so no constraint will reject the write.