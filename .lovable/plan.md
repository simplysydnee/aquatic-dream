
# Resend Private Lesson Confirmations

Send confirmation emails to the 15 active private-lesson bookings that never got one (Taylen Tickenoff excluded). Emails make clear there's nothing to pay now — the card on file is charged the day of each lesson ($50 in June, $65 after, per existing `getPrivateLessonPrice`). First-time private-lesson parents also get the full "What to Expect" welcome block.

## Changes

### 1. `src/components/admin/email-templates/lesson-booking-confirmation.tsx`
- Add props: `chargeNotice?: string`, `isFirstPrivateLesson?: boolean`.
- When `paymentLink` is missing/empty, hide the "Pay Now" CTA block entirely and render `chargeNotice` instead (e.g. "Your card on file will be charged $50 the day of each June lesson and $65 for any lesson after June. Nothing to pay now — just show up.").
- When `isFirstPrivateLesson` is true, append a "Welcome to Aquatic Dreams — What to Expect" section with the full copy the user provided (Arrival, Pre-Class Prep, Swim Diapers, Meeting Your Instructor, Pool Deck & Viewing Rules, Departure, 30-min no-food reminder, sign-off).
- Keep the existing concise "Parent Information" bullets for all bookings.

### 2. New `supabase/functions/_shared/send-private-booking-confirmation.ts`
Shared helper extracted from `confirm-private-booking/index.ts`:
- Loads booking + occurrences.
- Builds schedule list, ICS + Google calendar links via `buildSessionCalendarLinks`.
- Computes per-occurrence price via `getPrivateLessonPrice`; builds `totalAmountDue` string (handles mixed June/post-June series).
- Builds `chargeNotice` string from the same pricing data.
- Computes `isFirstPrivateLesson` = no prior `lesson_bookings` row for `parent_email` with `lesson_type in ('private','semi_private')` and `status='active'` created before this booking.
- Invokes `send-transactional-email` with `templateName: 'lesson-booking-confirmation'`, omitting `paymentLink`, passing `chargeNotice` + `isFirstPrivateLesson`.
- Idempotency key: `private-booking-<id>` for initial send, `private-booking-resend-<id>-<timestamp>` for resends.
- Updates `confirmation_email_status` / `_sent_at` / `_error` on `lesson_bookings`.

### 3. Refactor `supabase/functions/confirm-private-booking/index.ts`
Replace inline email-build block with a call to the shared helper (initial-send mode). No behavior change for new bookings beyond the new copy + chargeNotice.

### 4. New `supabase/functions/resend-private-booking-confirmation/index.ts`
- Admin-only (verify JWT + `has_role(uid,'admin')`).
- Body: `{ booking_id: uuid }` or `{ booking_ids: uuid[] }`.
- Loops, calls the shared helper in resend mode, returns per-booking `{ booking_id, success, error? }`.

### 5. Backfill
Call `resend-private-booking-confirmation` once with the 15 booking IDs (Taylen excluded), report success/failure per booking.

## Technical notes
- No DB migration needed — `confirmation_email_status` columns already exist on `lesson_bookings`.
- `getPrivateLessonPrice` already returns $50 for 2026-06-01..2026-06-30 and $65 otherwise — used as-is.
- Semi-private ($45) handled by same helper since `getPrivateLessonPrice` covers it.
- No payment-link generation anywhere in this flow.
