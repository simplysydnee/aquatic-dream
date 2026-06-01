# Require Start & End Dates on Private Lesson Availability

Currently on `/admin/private-lessons`, when adding an availability block, the **Start date** and **End date** fields are marked "(optional)" for Weekly recurring blocks. We'll make them required for both Weekly and Date range types so every block has a defined window.

## Changes

**`src/pages/admin/PrivateLessonsAdmin.tsx`**
- Remove the "(optional)" hint next to Start date / End date labels.
- Mark both date inputs as `required`.
- In `addBlock()`, validate that `start_date` and `end_date` are filled (and that end ≥ start) before inserting. Show a toast error if not.
- Disable the "Add block" button until both dates are present.

## Not changing
- Database schema — `start_date`/`end_date` columns already exist and are nullable; we're enforcing required-ness in the UI only (existing blocks without dates remain valid).
- Slot resolver in `src/lib/privateBooking.ts` already respects start/end dates for weekly blocks (added in the previous change).
