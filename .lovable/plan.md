## Problem

When "Show weekly options" is on, the recurring panel currently lists every individual time/day combo an instructor has open, even if it only repeats once or twice. The parent can't really see a true recurring weekly slot, and the per-day grid below clutters the view.

## Fix (frontend-only, `src/components/private-lessons/SlotPicker.tsx`)

### 1. True recurring patterns

Build `weeklyGroups` so each option represents an `(instructor, day-of-week, start_time)` triple that is open **at least 6 of the 8 weeks** in the window (respecting the AM/PM filter). Patterns open <6 weeks are hidden.

Each pattern stores its full list of matching dates (the open ones). The label shows e.g. *"Wednesdays at 4:00 PM with Sophia Cheney — 7 of 8 weeks"*.

### 2. Hide the per-day grid in weekly mode

When `weeklyMode` is on, render only the recurring quick-picks (and the selected pattern's date list). The per-date browse grid is hidden. Day chip is also hidden (irrelevant); only the AM/PM filter remains.

### 3. Expand pattern → date list with skip

Clicking a pattern card "selects" it (one pattern at a time in v1). The card expands inline to show every date in the series:

```
Wednesdays at 4:00 PM · Sophia Cheney        [Change pattern]
  Jun 17  ✓                                                      ×
  Jun 24  ✓                                                      ×
  Jul 1   — unavailable (auto-skipped)
  Jul 8   ✓                                                      ×
  …
7 lessons selected · $455 total
```

- Each available date is selected by default. The tiny `×` in the corner removes that single week from the booking.
- Auto-skipped weeks (where the slot wasn't open) are shown greyed out with an "unavailable" note and cannot be toggled on.
- "Change pattern" deselects and returns to the pattern list.

### 4. Pricing reflects kept weeks

The sticky footer total stays `selectedList.length × $65`. Removing a week via `×` drops it from `selected`, so the count and total update immediately. ("Subtract from total" behavior.)

### 5. Switching modes

Toggling `weeklyMode` off clears any recurring selection (avoids confusion with the per-day grid). Toggling on clears prior single-slot selections for the same reason.

## Out of scope

- No backend, RPC, schema, or `fetchOpenSlots` changes.
- No change to slot holds / checkout flow — the picker still emits a flat `Slot[]` to `onContinue`.
- Only one recurring pattern at a time (multi-pattern booking can be a follow-up).
- No change to the day-grid (non-weekly) mode behavior beyond what was shipped last turn.
