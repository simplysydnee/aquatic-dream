# Per-Slot View + One-Time Availability for Private Lessons

Two related improvements to `/admin/private-lessons`:

## 1. Add "One-time" availability type

Today the **Type** dropdown only has "Weekly recurring" and "Date range". Add a third option:

- **One-time** — instructor opens a single day's worth of slots (e.g., "Saturday 11/15, 3pm–6pm, 30-min slots"). Internally stored as `kind = 'date_range'` with `start_date = end_date` and no `day_of_week` constraint, so the existing slot resolver in `src/lib/privateBooking.ts` works unchanged.

Form behavior:
- One-time → show single "Date" picker, hide Day-of-week.
- Weekly → require Start/End date + Day-of-week (as today).
- Date range → require Start/End date, optional Day-of-week (as today).

## 2. Show generated slots per block

In the **Current blocks** table, make each row expandable. When expanded, list the individual lesson slots that block produces (using the same slot-generation logic that powers the public booking page):

```text
▸ Maddie · Weekly · Sat · 3:00–6:00 · 30m  · Shallow         [delete]
  └ Sat Nov 15  3:00 PM   ● Booked — Smith, Liam (paid)
    Sat Nov 15  3:30 PM   ○ Open
    Sat Nov 15  4:00 PM   ○ Open
    Sat Nov 15  4:30 PM   ● Booked — Patel, Anika (card on file)
    Sat Nov 15  5:00 PM   ○ Open
    Sat Nov 15  5:30 PM   ○ Open
    Sat Nov 22  3:00 PM   ○ Open
    ...
```

Each slot row shows: date, time, status (Open / Held / Booked), and if booked, the swimmer name + payment status. For Weekly blocks we show the next ~4 occurrences by default with a "Show more" toggle to avoid huge lists. For one-time / short date ranges, show all slots.

## Technical details

- **Slot generation**: reuse the existing helper that builds slots from a block (in `src/lib/privateBooking.ts`). Run it client-side on the loaded `instructor_booking_blocks` for a configurable window (default: today through 8 weeks out).
- **Booking overlay**: cross-reference with already-loaded `lesson_bookings` + `lesson_booking_occurrences` (private, non-cancelled) and active `slot_holds` to mark each slot Open / Held / Booked.
- **No DB changes** — schema already supports all three kinds via existing `kind` + `start_date`/`end_date`/`day_of_week` columns.

## Files

- `src/pages/admin/PrivateLessonsAdmin.tsx` — add "One-time" type, expandable rows, slot rendering.
- `src/lib/privateBooking.ts` — export the per-block slot-generation helper if not already exported, so the admin page can reuse it.
