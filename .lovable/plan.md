## Problem

On `/book-private-lesson` → Pick times step, two confusing behaviors:

1. **Recurring + day chip = empty.** Toggling "Show weekly options" and clicking a day (e.g. Wed) shows "No recurring patterns available" — even when the instructor *does* have recurring patterns on other days.
2. **Recurring + AM/PM = empty / wrong.** Same root cause: the recurring panel is filtered by every day/time chip, so narrowing the day grid also hides recurring options for other days.
3. **Empty-state message is misleading.** When filters hide all slots, the page says *"No availability in the next 8 weeks. Try a different instructor"* — even though slots exist, they're just filtered out.

### Root cause

In `src/components/private-lessons/SlotPicker.tsx`:

- `weeklyGroups` is derived from `filteredSlots` (day + time chips applied). The recurring picker is meant to *choose* a day, so filtering it by the day chip defeats its purpose. With current DB data (Tue/Thu/Sat blocks only), picking Wed wipes out the recurring panel entirely.
- The no-availability empty state only checks `byDate.length === 0` and doesn't distinguish "no data" from "filtered out".

## Fix

Edit only `src/components/private-lessons/SlotPicker.tsx`:

1. **Recurring panel ignores the day chip.**
   - Build `weeklyGroups` from `slots` with only the **time** filter applied (AM/PM), not the day filter. The whole point of the recurring quick-pick is to pick a day, so the day chip shouldn't gate it.
   - Time filter still applies so AM/PM narrows recurring patterns correctly.

2. **Better empty state for the day grid.**
   - If `slots.length > 0 && byDate.length === 0` → show *"No slots match your filters."* with an inline **Clear filters** button (resets `dayFilter` and `timeFilter`).
   - Keep the original *"No availability in the next 8 weeks…"* message only when `slots.length === 0`.

3. **Sanity-check AM/PM logic** (already correct: `hour >= 12` = PM). No change needed; the perceived bug is just the day-chip filtering described in #1.

## Out of scope

- No backend / RPC / schema changes.
- No changes to `fetchOpenSlots` or `instructor_booking_blocks` data.
- No redesign of the chip UI — only behavior.
