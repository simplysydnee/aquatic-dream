# Private Lessons admin — clearer slot actions

## Goals
1. Rename the confusing "Block this slot" wording so it matches the "Close" language used elsewhere.
2. Let an owner act on **a single date** of a slot — never the whole recurring series — with two distinct actions: **Cancel booking** and **Delete slot**.

## What changes in the UI (`src/pages/admin/PrivateLessonsAdmin.tsx`)

### Renames (labels only)
- "Block this slot" → **Close slot**
- "Unblock" → **Reopen slot**
- Badge "Blocked" → **Closed**
- Toast copy updated to match.

### Slot action dialog — actions per state

**Open slot** (no booking, not closed)
- `Close slot` — makes this exact date/time unavailable on the public booking page. One-date blackout only.

**Booked slot** (e.g. Jaclyn 12:30 on Jun 13)
- `Cancel this booking` — cancels only that single occurrence. Skips the auto-charge for that date. Leaves the rest of the recurring series untouched. Slot returns to Open afterward.
- `Cancel & close slot` — same as above, then immediately closes the slot so it can't be re-booked.
- A clear note in the dialog: "This affects only {date}. Other dates in the recurring booking are not changed."

**Closed slot**
- `Reopen slot` — deletes that one blackout row.

### Per-date safety
- Every action passes the specific `occurrence_date` (and `occurrence_id` when present).
- The recurring `lesson_bookings` row is never modified — only the matching `lesson_booking_occurrences` row for that date.
- Closing/reopening operates on a single-date `instructor_booking_blocks` row (`kind='date_range'`, start=end=that date, exact start/end time), so no other dates are ever affected.

## Technical notes
- `cancelSlotOccurrence` continues to update only `lesson_booking_occurrences` (status='cancelled', skip auto_charge) for the one `occurrence_id`.
- "Cancel & close slot" runs cancel first, then `blockSlot()` (with the existing duplicate guard).
- "Reopen slot" deletes only the blackout row whose id is attached to the tile.
- No edge function or schema changes required.

## Out of scope
- No changes to the recurring-series management UI or to public booking flow.
- No changes to refund logic (existing auto-charge skip already handles the financial side for cancelled occurrences).
