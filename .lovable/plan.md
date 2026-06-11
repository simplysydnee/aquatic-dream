## What I found

- **Reet + Armani are double-booked at Grace, Sat 6/13, 10:30am.**
  - Reet was moved from the original 10:00am booking to 10:30am using an occurrence-level time override.
  - The public booking availability check was still looking only at the original booking start time, so it still thought Reet occupied 10:00am, not 10:30am.
  - Armani then created a self-serve pending-card booking for 10:30am.

- **Armani did sign a waiver, but has no card on file.**
  - There is a signed agreement row for Armani.
  - The booking row’s `waiver_signed_at` was not stamped, so admin screens can still look like “no waiver.”
  - The booking is `pending_card` with no saved payment method. The calendar currently shows pending-card rows too much like real booked lessons.

- **Carson’s Saturday 3:30pm with Sophia is from the old multi-slot bug.**
  - Saturday was not a Sophia availability slot.
  - The old public flow allowed selecting slots across different days/instructors, then stored only the first slot’s instructor/time on the booking row.
  - Carson’s occurrences therefore all display as Sophia at 3:30pm, even on days that were not Sophia availability.

- **Karanveer is not duplicated in the database.**
  - I found one active booking with 3 weekly occurrences: 6/13, 6/20, 6/27.
  - If it looks duplicated on the page, that is display/list grouping, not two identical booking rows.

- **There is no database-level double-booking protection right now.**
  - Several code paths check availability in the UI, but the database can still accept overlapping lesson occurrences.
  - Some older admin paths also create lesson bookings directly instead of going through the newer validated booking flow.

## Plan to fix it

### 1. Add backend double-booking protection
- Add a database validation trigger on private lesson occurrences.
- Prevent a non-cancelled occurrence from overlapping another non-cancelled occurrence for the same effective instructor/date/time.
- Use the real effective values:
  - `instructor_override_id` falls back to booking instructor
  - `start_time_override` falls back to booking start time
  - `end_time_override` falls back to booking end time
- Treat recent `pending_card` holds as temporary blockers, but do not let old abandoned pending-card rows block forever.

### 2. Fix the public self-serve booking flow
- Update public slot availability to subtract moved/rescheduled occurrence times, not just original booking times.
- Enforce one instructor per booking on the backend too, not just in the UI.
- Validate every submitted slot is still inside an open instructor booking block and not inside a blackout/closed slot.
- Recheck conflicts when the card setup is confirmed, so an abandoned or racing checkout cannot activate on top of an already-booked slot.

### 3. Fix admin booking/reschedule paths
- Add the same effective-time conflict checks to `admin-create-private-booking` before it inserts occurrences.
- Make rescheduling respect closed/blackout slots and open availability by default.
- Stop older admin “add event/private lesson” paths from directly inserting private lesson bookings without the validated booking backend.
- Keep the `/admin` Add Booking flow as the go-to path for private, semi-private, and group bookings.

### 4. Fix waiver/card display
- Stamp `waiver_signed_at` when the self-serve private lesson agreement is signed.
- Show `pending_card` rows as “pending card setup,” not as confirmed scheduled lessons.
- Hide or separate stale pending-card rows from the calendar/booked lessons so they do not look like real booked lessons.

### 5. Fix booked-lessons list clarity
- Keep one row per booking in the Booked Lessons table.
- Show the occurrence count and expand details only inside the booking detail dialog.
- Add clear badges for: confirmed, pending card setup, missing card, waiver signed, waiver needed.

### Out of scope for this fix
- No cleanup/deletion/cancellation of existing Carson/Reet/Armani/Sophia data, per your earlier instruction.
- The existing bad records will remain until you choose to manually clean them up, but the code will stop allowing new ones.