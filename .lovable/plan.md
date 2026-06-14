# Merge duplicate swimmer rows in the booking client picker

## Problem

In the "Who is this for?" search (`BookingWizard.tsx`), the same swimmer appears twice when one source has a last name and another doesn't:

- **Weston Reiseck** (Group enrollment) + **Weston** (Lesson Request) — same parent `kaylareiseck@gmail.com`.
- Earlier: **Ryker Lucas** (Private booking) + **Ryker** (Lesson Request) — same parent.

Cause: dedupe key is `email|first|last`. Lesson requests store the child as a single `child_name` field (often just a first name), so the `last` slot is empty and the key never collides with the booking/enrollment row that has both names.

Different parents (e.g. Weston Bomer with Katie Bomer / pinktrapshooter@gmail.com) stay separate — they should.

## Fix

Single-file change in `src/components/admin/booking/BookingWizard.tsx`, inside the search `useEffect` that builds the `map` of `ClientSearchResult` (≈ lines 367–401):

1. Keep the existing insert order (booking → enrollment → request) so when keys do match the richer row wins.
2. After all three sources are inserted, run a **merge pass** over the map values grouped by `parent_email`:
   - For each pair where `first_name` matches (case-insensitive) and one entry's `last_name` is empty while the other's is set, drop the no-last-name entry and copy any fields it had that the survivor is missing: `swimmer_age`, `swimmer_dob`, `parent_phone`, `parent_first/last`, and the request-only context (`request_preferred_times`, `request_notes`, `request_status`) so admins still see the "Prefers:" line.
   - Survivor's `source` stays as the booking/enrollment so the chip shows "Private"/"Group" instead of "Lesson Request", but the preserved request fields keep the lesson-request context visible.
3. Same-parent + same-first + both have a (different) last name → leave alone, they're real siblings.

## Out of scope

- No DB writes, no schema changes, no merging of underlying `lesson_requests` / `lesson_bookings` / `swim_enrollments` rows.
- No changes to Clients admin, swimmer modal, or charge logic.
- No change to the "New" manual-entry flow.
