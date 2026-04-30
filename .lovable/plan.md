# Book Lesson From Lesson Request

Add a **"Book Lesson"** button inside the Lesson Request detail dialog so admins can convert a request into a confirmed booking + calendar event without leaving the page. The picker is shift-aware: it suggests open time slots based on which instructors are scheduled to work that day, but always allows manual override.

## UX Flow

```text
Lesson Requests page
  └─ Click row → LessonRequestDetailDialog opens
       ├─ [Send Reply] (existing)
       └─ [Book Lesson]  ← NEW
              │
              ▼
       BookFromRequestDialog
        ┌──────────────────────────────────────┐
        │ Parent / Child (prefilled, locked)   │
        │ Lesson type (private / semi)          │
        │ Pick a date  [calendar]               │
        │                                       │
        │ Suggested slots for this date:        │
        │   • Sarah   8:00–9:00  (open)         │
        │   • Sarah   9:00–10:00 (open)         │
        │   • Mark    4:00–5:00  (open)         │
        │   ⓘ No instructor scheduled? Manual ▼ │
        │                                       │
        │ — OR —                                │
        │ Manual: instructor [picker]           │
        │         time  [HH:MM] – [HH:MM]       │
        │         pool area [shallow/deep]      │
        │                                       │
        │ □ Recurring weekly until [date]       │
        │ □ Send confirmation + payment link    │
        │                                       │
        │           [Cancel]  [Book Lesson]     │
        └──────────────────────────────────────┘
              │
              ▼
       On success:
        • lesson_bookings row created
        • pool_events row(s) created (visible on calendar)
        • lesson_booking_occurrences row(s) created
        • Optional: confirmation email + Stripe link sent
        • Lesson request status auto-flips to "scheduled"
        • Toast + dialog closes
```

## How "Suggested Slots" Works

For the selected date:

1. Query `shifts` where `shift_date = pickedDate` AND `status = 'published'` AND `instructor_id IS NOT NULL`. These are confirmed working hours per instructor.
2. Query `pool_events` for the same date to know what's already booked.
3. For each shift, slice it into 30-min increments matching the lesson length (default 60 min for private, 45 min for semi). Drop any increment that overlaps an existing pool event in the same pool area.
4. Render the result as clickable chips grouped by instructor. Clicking a chip auto-fills instructor, start, and end time.

If no shifts are published for that date, show: *"No instructors scheduled for this date — use Manual entry below."*

## Manual Override

Always shown beneath the suggestions. Uses the existing `InstructorPicker` (lists all active instructors regardless of shifts) plus time/pool inputs. No shift is required to book — the admin can assign an instructor whose shift hasn't been created yet.

## Reuse vs New

- **Reuse**: `InstructorPicker`, `LessonBookingFields` (parent/child/recurring fields), the `lesson_bookings` + `pool_events` + `lesson_booking_occurrences` insert sequence from `AddPoolEventDialog.handleLessonBookingSave`, and the `send-lesson-booking-confirmation` edge function.
- **New**: `BookFromRequestDialog.tsx` (lighter wrapper around the booking save logic, prefilled from the lesson request), and a small `useAvailableSlots(date)` hook that returns suggestions from shifts minus pool events.

## Status Sync

After a successful booking, update `lesson_requests.status = 'scheduled'` and patch the parent row in `LessonRequestsAdmin` via the existing `onUpdated` callback so the list reflects it without a refetch.

## Technical Details

- New file: `src/components/admin/BookFromRequestDialog.tsx`
- New file: `src/hooks/useAvailableSlots.ts` — returns `{ instructorName, start, end }[]` for a given date by joining `shifts` (published, has instructor) with `instructors.name` and subtracting overlapping `pool_events`.
- Edit: `src/components/admin/LessonRequestDetailDialog.tsx` — add "Book Lesson" button in the footer, wire dialog state.
- Default lesson duration: 60 min for private (`$65`), 45 min for semi-private (`$45`) — matching `defaultLessonBookingData` in `AddPoolEventDialog`.
- Default pool area: `shallow`.
- Insert flow mirrors `handleLessonBookingSave` (booking → pool_events → occurrences → optional confirmation email via `send-lesson-booking-confirmation` with `getStripeEnvironment()`).
- Suggested-slot generation runs client-side; no new edge function needed.
