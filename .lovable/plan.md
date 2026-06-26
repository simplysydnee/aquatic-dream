## Sort group class slots by time in the booking wizard

In `src/components/admin/booking/BookingWizard.tsx` (around line 1623), the group class picker currently lists slots in whatever order they come back from the database, producing the jumbled order in the screenshot (6:00, 4:15, 5:30, 6:30, 4:45, 3:15).

**Change:** After filtering, sort the list chronologically before rendering:

1. Primary sort: `day_of_week` (so Mon/Wed groups stay together, Tue/Thu next, etc.)
2. Secondary sort: `start_time` ascending (3:15 → 3:45 → 4:15 → 4:45 → 5:30 → 6:00 → 6:30)
3. Tertiary sort: `swim_level` (stable tiebreaker when level filter is "all")

No other behavior, filters, or styling changes.