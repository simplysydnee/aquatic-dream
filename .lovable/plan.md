## Goal
Make step 2 ("Pick a slot") on `/join` usable when Private Swim returns ~52 slots: add a filter bar, group results by day, show a count, and give a clean empty state for over-filtering.

All work is inside `src/pages/JoinMembership.tsx`. No query, edge function, checkout, pricing, or consent changes.

## 1. Filter state
Add three pieces of state: `filterDay` ("any" or a day index), `filterInstructor` ("any" or instructor name), `filterTime` ("any" | "morning" | "afternoon" | "evening"), all defaulting to "any".

Reset all three to "any" whenever:
- a program is selected in `selectPlan`
- the parent taps Back from step 2 to step 1
- the Small Group "Recommended level" dropdown changes

## 2. Options built from returned slots
Derive option lists from the current `planSlots` array (not hardcoded):
- Day: unique `day_of_week` values present, sorted Sunday to Saturday, labelled from the existing `DAYS` array.
- Instructor: unique non-null `instructor_name` values, alphabetical.
- Time: fixed three buckets, but they are simple ranges over `start_time` — Morning before 12:00, Afternoon 12:00 up to 17:00, Evening 17:00 and later.

## 3. Filter bar rendering
Render the bar above the slot list only when `planSlots.length > 8`, so Adult (6) and Small Group (2) are unchanged. Three shadcn `Select` dropdowns styled to match the existing controls on the page, each defaulting to "Any". Filters combine with AND.

## 4. Grouping and count
Apply the filters to `planSlots` to get `visibleSlots`. Group `visibleSlots` by `day_of_week`, render day headings in Sunday-to-Saturday order, times ascending inside each day. Grouping applies whether or not the filter bar is visible.

Above the list, show the count, for example "12 times available" (singular "1 time available").

Each slot card keeps its exact current markup: open slots stay tappable buttons that set the slot and advance to step 3; full slots keep the dashed "Class full" treatment with the working "Join waitlist" button. No auto-selection.

## 5. Empty states
Two distinct cases:
- `planSlots.length === 0` (genuinely no slots): keep the existing copy exactly as it is today, including the level-specific Small Group variant.
- `planSlots.length > 0` but filters match nothing: show "No times match these filters" plus a "Clear filters" button that resets all three dropdowns to "Any".

## Technical notes
- Filtering and grouping are `useMemo` values derived from `planSlots`; the `get-open-slots` invoke, `loadSlots`, and the `planSlots` level-matching logic stay untouched.
- Time bucketing compares the `HH:MM` string prefix of `start_time`, no date parsing needed.
- Instructor filter matches on `instructor_name`; slots with a null instructor are only excluded when a specific instructor is chosen.
