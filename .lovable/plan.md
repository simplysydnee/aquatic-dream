## Goal

From the private lesson booking detail dialog, let an admin move a private/semi-private lesson to a different open slot:

1. **Move one occurrence** — pick a new date + open slot (any instructor).
2. **Move all remaining occurrences** — pick a new weekly day/time/instructor; future occurrences re-laid onto matching weekdays.
3. **Change instructor only** — keep date/time, reassign to a different instructor whose shift covers the slot.

Payment status stays attached to the moved occurrence. Parent always gets an updated confirmation email.

## UX

In `PrivateLessonsAdmin.tsx` booking detail dialog (lines ~899–955), add a per-row "Reschedule" action and a footer "Reschedule remaining" button next to "Cancel booking".

New `ReschedulePrivateLessonDialog.tsx` (under `src/components/admin/booking/`) with a mode toggle:

```text
( ) This occurrence only      [date picker → open-slot list]
( ) All remaining occurrences [new weekday + open-slot list]
( ) Change instructor only    [instructor list filtered to those with a shift covering the existing slot]
```

The open-slot list reuses `useAvailableSlots(date, { lengthMin })` so any instructor's published shift shows up (excluding pool conflicts). Length comes from the booking's existing `end_time - start_time`. A confirmation summary shows old → new before submit.

## Backend

New edge function `reschedule-private-lesson-occurrence` (verify admin role, validated zod body):

```text
{ booking_id, mode: "one" | "remaining" | "instructor", occurrence_ids?: string[],
  new_date?: string, new_start?: "HH:MM", new_end?: "HH:MM",
  new_instructor_id?: string, new_instructor_name?: string,
  environment: "sandbox"|"live" }
```

Logic:
- **one** — update one `lesson_booking_occurrences` row's `occurrence_date` (and the booking's instructor only when explicitly chosen for this occurrence — stored via new optional `instructor_override_id` / `start_time_override` / `end_time_override` columns on `lesson_booking_occurrences`). Keeps the rest of the series untouched.
- **remaining** — for every non-cancelled occurrence with `occurrence_date >= today`, walk forward week-by-week from the chosen new start date, assigning each to the next matching weekday at the new time. Update `lesson_bookings.instructor_name/instructor_id/start_time/end_time/day_of_week/series_start` accordingly (series-wide change).
- **instructor** — only updates `instructor_override_id/name` on the targeted occurrence(s); times unchanged.

Before any write: re-validate each new (date, start, end, instructor) against:
1. instructor has a published `shifts` row covering it,
2. no overlapping `pool_events` in the same pool area,
3. no overlapping `lesson_booking_occurrences` for that instructor at that time.

On success, enqueue an updated app email via `send-transactional-email` template `private-lesson-rescheduled` (one per affected occurrence batch, with old/new date/time/instructor list).

## Schema migration

Add nullable override columns to `lesson_booking_occurrences`:
- `instructor_override_id uuid references public.instructors(id)`
- `instructor_override_name text`
- `start_time_override time`
- `end_time_override time`

No RLS changes (existing policies on the table cover it). Frontend reads override fields when present and falls back to booking-level values.

## New app email template

`supabase/functions/_shared/transactional-email-templates/private-lesson-rescheduled.tsx` + register in `registry.ts`. Includes child name, old date/time/instructor, new date/time/instructor, and reminder of cancellation policy hours.

## Files

**New**
- `src/components/admin/booking/ReschedulePrivateLessonDialog.tsx`
- `supabase/functions/reschedule-private-lesson-occurrence/index.ts`
- `supabase/functions/_shared/transactional-email-templates/private-lesson-rescheduled.tsx`
- migration adding override columns

**Edited**
- `src/pages/admin/PrivateLessonsAdmin.tsx` — add per-row + footer actions, wire dialog, refetch on done
- `supabase/functions/_shared/transactional-email-templates/registry.ts`

## Notes / out of scope

- Slot length is taken from the current booking; we do not let admins change lesson duration in this flow.
- Pool area defaults to `shallow` (matches `useAvailableSlots` default); we can surface a pool-area selector later if needed.
- Refund logic is unchanged — paid status simply travels with the moved occurrence.
