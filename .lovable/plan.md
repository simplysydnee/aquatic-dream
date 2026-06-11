## Goals
1. **Persist calendar filter state across page refreshes.** Right now `CalendarAdmin` resets `activeFilters` to all filters on every mount, so hiding "I Can Swim" doesn't survive a refresh.
2. **Show swimmer counts in the I Can Swim 209 column header**, matching the Aquatic Dreams layout (total swimmers chip + per-instructor breakdown).

## Changes

### 1. `src/pages/admin/CalendarAdmin.tsx` — persist filters
- Initialize `activeFilters` from `localStorage.getItem("calendar-active-filters")` (parse JSON array of `ActivityType` strings). Fall back to all filters if missing/invalid.
- In `toggleFilter` and `onShowAll`, write the updated set back to localStorage as a JSON array.
- Key: `"calendar-active-filters"`.

### 2. `src/components/admin/calendar/CalendarDayView.tsx` — ICS swimmer counts
- In the ICS column header (currently `"I Can Swim 209 — X instructors today"`), add chip(s) mirroring the AD pattern:
  - Total swimmer count: sum of `confirmed_bookings` across `todayICS`.
  - Instructor count chip.
- In the "Instructors today" row, also include ICS instructors with their per-instructor swimmer counts in parentheses, e.g. `"Coach Maya (4)"`. Compute by grouping `todayICS` by `instructor_name` and summing `confirmed_bookings`.
  - Use a distinct visual cue (subtle ICS blue background) so admin can tell which chips are ICS vs AD.
  - Clicking an ICS instructor chip should still open the same day-modal (or no-op if the modal doesn't currently support ICS — keep behavior consistent with how AD chips work). If the day-modal only knows AD data, the ICS chips will be display-only.

## Out of scope
- No changes to filter UI / labels.
- No changes to ICSSession data shape — `instructor_name` and `confirmed_bookings` already exist.
- No backend / DB changes.
