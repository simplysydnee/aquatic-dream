## Goal

Make the calendar page (`/admin`) the go-to place for staff to book any lesson — private, semi-private, or group — using the same wizard as `/admin/private-lessons/new`. Improve the one-time slot picker so it loads the next 7 days of open slots across all instructors out of the box.

## Changes

### 1. `src/pages/admin/CalendarAdmin.tsx` — header CTA
- Add a "Book Lesson" button next to "Add Event" (same row, primary style).
- Click opens `BookingQuickDialog` (already used by `PrivateLessonsPanel`), prefilled with the currently viewed date but no slot.
- On success → call existing `refetch()` so new bookings/occurrences appear immediately on the calendar grid.

### 2. `src/components/admin/booking/BookingWizard.tsx` — `OneTimeChooser`
Replace today's "pick instructor + time inputs" form with a slot-list UI:

- On mount, fetch open slots for the next 7 days using existing `fetchOpenSlots` helper from `src/lib/privateBooking.ts` (already powers the public booking flow + `PrivateLessonsPanel`).
- Header controls:
  - **Date** chips for the next 7 days (today → +6); clicking filters the list.
  - **Instructor** select with an "All instructors" default.
  - **Pool** select (kept, defaults to shallow — only used when admin manually overrides time).
- Slot list: time + instructor + pool, sorted soonest-first; click selects (`instructorId`, `instructorName`, `date`, `startTime`, `endTime`).
- Collapsible "Custom time" section retains today's manual date/time inputs for off-grid bookings (e.g. comp lessons outside published blocks).
- Empty state: "No open slots in the next 7 days — use Custom time."

### 3. Semi-private "Add sibling" (BookingWizard Client step)
- Confirm + tighten existing `swimmers[1]` UI: first name, last name, and DOB are all **required** when type is `semi_private` (today DOB is optional). Parent contact stays as-is — single parent row for the whole booking, with the optional partner-parent cc fields kept on swimmer[1] as today.
- Update `slot` step gating so semi-private can't proceed without both swimmers having `first_name`, `last_name`, `dob`.

### 4. No backend changes
- All slot/instructor data comes from existing RPCs (`get_active_instructors_public`, `get_public_booking_blocks`, `get_active_slot_holds`) already used by `fetchOpenSlots`.
- No schema, no edge functions, no RLS work.

## Out of scope
- Changing how bookings are saved (still goes through the existing wizard → `admin-create-private-booking` / group enrollment path).
- Rearranging the Private Lessons admin page.
- Mobile-specific redesign of the wizard.

## Technical notes
- `fetchOpenSlots({ fromDate: today, weeks: 1, sessionToken })` returns `Slot[]` already filtered against existing occurrences + active holds.
- `BookingQuickDialog` already exposes `initialSlot` + `initialType`; pass `{ date: currentDate }` from CalendarAdmin so the date chip strip opens on the day the admin is viewing.
- For the semi-private DOB gate, extend the existing `canAdvance("client")` check in `BookingWizard` to require `swimmers[1].dob` when `type === "semi_private"`.
