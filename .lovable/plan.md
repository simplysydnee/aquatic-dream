## Goal

Expand the **Clients** filter chips and switch the swimmer list to **infinite scroll**.

## Filter chips (grouped)

Replace the single chip row with three labeled groups:

**Status**
- All · New Inquiry · Enrolled · Active · Upcoming · Unpaid · Past

**Request Status**
- Any Request · Request · New · Request · Contacted · Request · Scheduled

**Lesson Type**
- Private · Semi-Private · Group

Filters remain single-select (one active filter at a time, like today). Lesson Type matches if the swimmer has any request, enrollment, or booking of that `lesson_type` (`private`, `semi-private`, `group`).

## Infinite scroll

- Render **25 swimmers** initially.
- Wrap the list in a scrollable container with a max height (`calc(100vh - 22rem)`) so it scrolls inside the page rather than pushing the filter bar off-screen.
- Place a sentinel `<div>` at the bottom; an `IntersectionObserver` (200px rootMargin) loads the next 25 when it enters view.
- Reset to 25 whenever the search text or filter chip changes.
- Show "Loading more… (X of Y)" while more remain, then "— End of list —" when exhausted.

## Files

- **Edit only**: `src/pages/admin/ClientsAdmin.tsx`
  - Expand the `Filter` type and `FILTER_GROUPS` constant
  - Add `visibleCount` state + `IntersectionObserver` effect
  - Wrap list in scrollable container with sentinel

No DB, no other component changes.