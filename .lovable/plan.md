

## Merge "Swim Session" and "Swim Lesson" into one filter

### What changes

1. **`CalendarFilterBar.tsx`** — Remove the separate "Swim Lesson" chip. The existing "Swim Session" chip (type `swim`) will cover both swim_sessions records AND swim-lesson pool_events.

2. **`CalendarDayView.tsx`** — When `activeFilters.has("swim")` is true, show both `todaySessions` (from swim_sessions table) AND `swimLessonEvents` (pool_events with type "swim-lesson"). Remove the separate `swim-lesson` filter check.

3. **`CalendarAdmin.tsx`** — Remove `swim-lesson` from the default active filters set and any legend references, since it's now covered by `swim`.

4. **`CalendarFilterBar.tsx` types** — Remove `"swim-lesson"` from the `ActivityType` union (keep it as a valid `event_type` in pool_events, just not a separate filter).

### What stays the same

- The "Swim Lesson" event type chip in `AddPoolEventDialog` stays — admins still create these as `event_type: "swim-lesson"` pool_events
- The swim-lesson pool_events still render with level-colored badges in the AD columns
- All save/create logic remains unchanged

