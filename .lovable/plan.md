## Fix weekly options day filter

**Issue**: In `src/components/private-lessons/SlotPicker.tsx`, the "Show weekly options" quick-picks ignore the active day-of-week filter chips. The `weeklyOptions` useMemo iterates over `slots` (unfiltered) instead of respecting `dayFilter` / `timeFilter`.

**Fix**: Update `weeklyOptions` to honor the current filters:
- If `dayFilter.size > 0`, only include patterns whose `dow` is in `dayFilter`.
- If `timeFilter !== "all"`, only include patterns whose start hour matches AM/PM.
- Count of recurring dates also recalculated from the same filtered set so the "(N dates)" label is accurate.

Single-file change, no behavior changes elsewhere.