## Goal
Manual admin bookings (parent hasn't saved a card yet, status = `pending_card`) should appear as **booked** on the schedule and calendar — but with a clear **"Pending card"** warning so admins know payment isn't secured.

The previous fix already made `pending_card` bookings count as taken in the slot grid. This adds the visible warning.

## Changes

### 1. `src/pages/admin/PrivateLessonsAdmin.tsx` — Schedule tab slot pills
- `bookingMap` already carries `status`. In the slot pill (`s.booking` branch), when `s.booking.status === "pending_card"`:
  - Swap the lesson-type badge for an amber **"Pending card"** badge (`bg-amber-100 text-amber-800 border-amber-300`).
  - Keep child name + lesson type line, but replace the payment status line with "Awaiting card on file".

### 2. `src/components/admin/calendar/PrivateLessonsPanel.tsx` — day calendar
- Extend `paymentBadge` (or add a sibling) to render a **"Pending card"** amber badge when the booking's `status` is `pending_card` (regardless of `payment_status`).
- Requires `useCalendarData` to expose `status` on `PrivateLessonBooking` (currently selects `status` already, just make sure it's mapped through). If not surfaced, add it.

### 3. `src/hooks/useCalendarData.ts` — pass `status` through
- Confirm `lesson_bookings.status` is selected and mapped onto the `PrivateLessonBooking` shape returned to the calendar. Add it if missing so the panel can render the warning.

### 4. Detail dialog (already shows `Status: pending_card`)
- No change needed — the existing status row already surfaces it.

## Visual treatment
- Amber/orange badge to distinguish from paid (green), unpaid (orange darker), card-on-file (blue).
- Tooltip / aria-label: "Parent has not saved a card on file yet."

## Out of scope
- No DB / edge function changes.
- No change to booking creation flow.
- No automatic reminders (separate request).
