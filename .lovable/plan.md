# Fix: "Calendar events failed — pool_events_event_type_check" when scheduling private lessons

## Root cause

The `pool_events` table has a CHECK constraint that only permits these `event_type` values:

```
i-can-swim, dive-session, pool-rental, maintenance, other
```

But the Add Event dialog (and the lesson-booking + swim-lesson flows inside it) insert rows with `event_type` set to:

- `private-lesson`
- `semi-private-lesson`
- `swim-lesson`

Postgres rejects the insert, the toast shows "Calendar events failed … violates check constraint `pool_events_event_type_check`", and no calendar event is created (though the `lesson_bookings` row was already inserted just before, leaving an orphan).

## The fix

### 1. Database migration

Drop and recreate the check constraint to include the lesson event types the app already uses:

```sql
ALTER TABLE public.pool_events
  DROP CONSTRAINT IF EXISTS pool_events_event_type_check;

ALTER TABLE public.pool_events
  ADD CONSTRAINT pool_events_event_type_check
  CHECK (event_type IN (
    'i-can-swim',
    'dive-session',
    'pool-rental',
    'maintenance',
    'other',
    'private-lesson',
    'semi-private-lesson',
    'swim-lesson'
  ));
```

No data backfill needed — existing rows already use the original allowed values.

### 2. Cleanup of orphaned `lesson_bookings`

Because earlier failed attempts created `lesson_bookings` rows without any matching `pool_events`, scan and delete bookings that have zero linked occurrences from the failed attempts (only ones with no `lesson_booking_occurrences` row). I'll list them first and confirm count before deleting.

### 3. Code hardening (small)

In `src/components/admin/calendar/AddPoolEventDialog.tsx` `handleLessonBookingSave`, if the `pool_events` insert fails after the `lesson_bookings` row was created, roll back by deleting the just-created booking so we don't leak orphan bookings again. Same defensive cleanup for `handleSwimLessonSave` if applicable.

## Outcome

After approval, the owner can save Private and Semi-Private lessons on the calendar without the check-constraint error, and any earlier orphan bookings from failed attempts will be cleaned up.
