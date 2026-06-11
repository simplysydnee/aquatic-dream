## Fix #1 — Lock public slot picker to one instructor

**File:** `src/components/private-lessons/SlotPicker.tsx`

- Add `selectedInstructorId` derived from current `selected` map (first slot's `instructor_id`, or `null` when empty).
- In `toggle(s)`, reject adding a slot whose `instructor_id` differs from `selectedInstructorId`. Show a toast: "Please book all lessons with the same instructor. Clear your selection to switch." (Recurring pattern selection already filters by instructor — no change.)
- In the rendered day grid, visually disable (greyed, not clickable) any slot from a different instructor when a selection is in progress, with a small "Different instructor" hint on hover.
- Add a "Clear & switch instructor" button in the selection summary when `selectedInstructorId` is set.
- No backend change needed — `create-private-booking-setup` already uses `slots[0].instructor_id`, which will now be consistent across the whole booking.

## Fix #2 — Same lock in admin BookingWizard

**File:** `src/components/admin/booking/BookingWizard.tsx`

The new "Custom time" path already picks one instructor explicitly. The "Next 7 days" list shows multiple instructors but currently allows picking one slot. Keep single-slot for one-time bookings; no change needed there. Add a small note next to the instructor filter: "All occurrences of a series must use the same instructor."

## Fix #3 — Add "Booked Lessons" section to /admin/private-lessons

**File:** `src/pages/admin/PrivateLessonsAdmin.tsx`

Rename the existing top section header from blocks to "Open Availability (Booking Blocks)" to clarify what those rows are. Add a new section underneath: **"Booked Lessons"**.

Booked Lessons section:
- Tabs: **Upcoming** (default) / **Past** / **Cancelled**.
- Source: `lesson_bookings` joined to `lesson_booking_occurrences` where `status != 'cancelled'` (Upcoming = `occurrence_date >= today`).
- Columns: Date, Time, Child, Parent, Instructor (from occurrence override → falls back to booking), Type (Private/Semi), Payment status, Actions (open existing `PrivateLessonDetailDialog`).
- Search box (child/parent name) and instructor filter.
- Counts shown in tab labels.

This makes the two-sources mismatch (blocks vs occurrences) obvious and gives a single place to spot orphaned occurrences like Carson's Sat 6/13.

## Out of scope (per your answers)

- No data cleanup — Carson's bad occurrences and Sophia's duplicate Tuesday block stay until you delete them manually.
- No per-occurrence instructor override storage. Locking the picker prevents the structural mismatch going forward.

## Technical notes

- `lesson_booking_occurrences` already has 31 columns including `start_time_override`, `end_time_override`, `instructor_override_id`, `instructor_override_name` — the Booked Lessons rows will prefer override values when present.
- No new RLS or migrations — both tables are already readable by admin via existing policies used elsewhere in this page.
- No edge-function changes.
