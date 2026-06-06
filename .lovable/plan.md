# Private Lessons on Admin Calendar

## Problem
- Calendar only renders private lessons that exist as `pool_events` rows. Real `lesson_bookings` / `lesson_booking_occurrences` (created via the public booking flow or `admin-create-private-booking`) never appear.
- Open `instructor_booking_blocks` slots (bookable but unbooked) are invisible to admins.
- There's no admin UI to manually book a private/semi-private lesson with a card on file. Existing `admin-create-private-booking` edge function skips Stripe entirely.
- New manual bookings don't send a confirmation email with price, waiver link, and "Add to Calendar" links.
- June promo price ($50) needs to be reflected in admin manual bookings and the confirmation.

## Plan

### 1. Load private-lesson data into the calendar
Extend `useCalendarData` to fetch, for the visible date range:
- `lesson_booking_occurrences` joined to `lesson_bookings` (booked lessons, with parent/child/instructor/time/price/payment + waiver state).
- `instructor_booking_blocks` (active, non-blackout) to compute **open slots** per day using the same logic in `src/lib/privateBooking.ts` (subtract taken occurrences). Reuse that helper server-side-style in the hook.

Render in `CalendarDayView`:
- **Booked private/semi-private** lessons as cards with the same detailed look as swim sessions: instructor, parent/child, time, price, payment status badge, waiver status, notes. Click opens a detail dialog (new `PrivateLessonDetailDialog`) with: cancel, charge now, resend confirmation, resend waiver.
- **Open slots** rendered as dashed/ghost cards with an inline "Book" button.

Respect existing `private-lesson` / `semi-private-lesson` filters.

### 2. Admin manual booking dialog
New `AdminBookPrivateLessonDialog` opened from:
- the "+" on an open slot card, OR
- a new "Book Private Lesson" button in the calendar header.

Fields (mirrors enrollment intake):
- Lesson type (private / semi-private)
- Instructor, date, start/end time, pool area (prefilled from slot if launched there)
- Parent first/last, email, phone
- Child first/last, age
- Notes / medical notes
- **Recurring weekly** toggle + series end date (uses same occurrence-generation logic as today)
- Price per session — defaulted via shared `getPrivateLessonPrice` (June 2026 = **$50 sale**, otherwise $65 private / standard semi)
- **Card on file required** checkbox (default on): collects payment method via Stripe SetupIntent before creating the booking.

### 3. Card on file capture
- Reuse existing `create-private-booking-setup` edge function to create a Stripe Customer + SetupIntent and return `client_secret`.
- Reuse `PrivateCardSetup.tsx` component embedded in the dialog (admin types card on the spot, or sends a "card on file" link to parent).
- On success, call updated `admin-create-private-booking` edge function with `stripe_customer_id` + `stripe_payment_method_id`, which writes them to `lesson_bookings`. (Existing function already accepts most fields — we'll add these two and trigger the confirmation email.)

### 4. Confirmation email
After booking is created, edge function sends a new transactional email via Resend (reuses `_shared/calendar-links.ts`):
- Subject: "Your Private Swim Lesson is Booked – Aquatic Dreams"
- Body: instructor, lesson date(s) listed, time, location, price per session (with June $50 callout when applicable), payment method on file note, link to **complete waiver** (uses `lesson_bookings.waiver_token`), and **Add to Calendar** buttons (.ics + Google) built via `buildMultiEventCalendarLinks` for recurring series.
- New edge function `send-private-booking-confirmation` (or extend `send-lesson-booking-confirmation`) invoked from `admin-create-private-booking`.

### 5. June pricing
- `_shared/private-lesson-pricing.ts` already returns $50 for June dates — confirm and surface that price in the dialog and the email. The per-occurrence charger already re-derives price so a series straddling July auto-bills $65 for July dates.

## Technical Notes
- New file: `src/components/admin/calendar/AdminBookPrivateLessonDialog.tsx`
- New file: `src/components/admin/calendar/PrivateLessonDetailDialog.tsx`
- Edit: `src/hooks/useCalendarData.ts` — add `lessonBookings`, `lessonOccurrences`, `openPrivateSlots`.
- Edit: `src/components/admin/calendar/CalendarDayView.tsx` — render booked + open private slots, wire onClick.
- Edit edge fn: `supabase/functions/admin-create-private-booking/index.ts` — accept `stripe_customer_id`, `stripe_payment_method_id`, `send_confirmation`; invoke confirmation function.
- New edge fn (or extension): `send-private-booking-confirmation` with waiver link + multi-event ICS.
- No schema changes required — `lesson_bookings` already has `stripe_customer_id`, `stripe_payment_method_id`, `waiver_token`.

## Open questions before I build
1. **Card on file** — required for every manual booking, or admin-toggleable per booking (e.g., for cash-only customers)?
2. **When to charge** — keep current model (charge per occurrence on/after lesson day via `charge-private-lesson-occurrence`), or charge first session immediately at booking time?
3. **Open slot density** — week view can get crowded if every 30-min open slot renders. Show open slots only in day view, or in both?
