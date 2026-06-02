## Two fixes for the private-lesson booking flow

### 1. Show the individual booked dates on the confirmation screen
Right now, when the recurring private-lesson booking finishes, the "You're booked!" page (`PrivateBookingFlow.tsx`, `step === "done"`) just says a confirmation email is on the way. It doesn't show the actual dates the parent just booked.

Fix: persist the selected slots into state at submit time and render them on the done screen as a tidy list (e.g. "Sat, Jun 13 · 12:00 PM · Jaclyn Vaughan"), matching the summary that already shows on the legal step.

### 2. Make sure the booking confirmation email sends + has Add-to-Calendar links
The email is wired up in `supabase/functions/confirm-private-booking/index.ts` and calls `send-transactional-email` with template `lesson-booking-confirmation`. The template already supports `icsLink` and `googleCalendarLink` (same buttons as the class enrollment email), but `confirm-private-booking` is **not** building or passing them — so the email arrives without the calendar buttons.

Fixes in `confirm-private-booking/index.ts`:
- Import `buildSessionCalendarLinks` from `_shared/calendar-links.ts` (already used by the enrollment confirmation email).
- After loading the booking + occurrences, build a single multi-date `.ics` + Google Calendar link covering every occurrence date at the booking's start/end time, titled `"<Child>'s Private Lesson — Aquatic Dreams"`, location `1212 Kansas Ave, Modesto, CA 95351`.
- Pass `icsLink` and `googleCalendarLink` into `templateData` so the template renders the same "Add to Calendar / Google Calendar" buttons used in the class enrollment confirmation.
- Keep the existing `idempotencyKey: private-booking-${booking_id}` so re-runs don't double-send. To verify the email actually went out for past bookings, also check `email_send_log` after the change deploys; if a specific booking's email never fired, we can re-invoke once with a fresh key.

No template changes are needed — `lesson-booking-confirmation.tsx` already renders `scheduleList`, `icsLink`, and `googleCalendarLink` in series mode.

### Files touched
- `src/components/private-lessons/PrivateBookingFlow.tsx` — list dates on the done screen
- `supabase/functions/confirm-private-booking/index.ts` — build + pass calendar links
