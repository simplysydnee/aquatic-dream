## Goal

Let parents book private lessons online by picking real instructor time slots, then save a card with Stripe to confirm. Auto-charge $65 the day after each lesson. Replace the "Request a Private or Semi-Private Lesson" tab on `/swim-enrollment` with a contact-only Semi-Private form (manual booking) and a full Private flow that mirrors the group enrollment UX.

## Public flow (`/swim-enrollment` → Private/Semi-Private tab)

Tab becomes two cards:
- **Private lessons → Book online** (new flow)
- **Semi-private → Request info** (the existing form, simplified to a contact request only; admin books manually)

Private booking steps:
1. **Parent & swimmer info** (parent name/email/phone, child name/age/notes) — same fields as group enrollment.
2. **Pick instructor (optional)** — list active instructors with bookable availability. "Any instructor" allowed.
3. **Pick slots** — calendar showing the next 8 weeks. Open instructor slots render as 30‑min tappable chips per day. Parent can:
   - Tap individual slots across multiple days/times (one-offs), OR
   - Toggle "Book weekly" → pick a weekday + time → system pre-selects all matching dates for N weeks; parent can uncheck any date.
   - Running total shows "X lessons × $65 = $X (charged after each lesson)".
4. **Legal agreements** — reuse `<LegalAgreements />`.
5. **Save card on file** — Stripe Embedded Checkout in `setup` mode (SetupIntent, no charge). On success, all selected slots are atomically claimed first-come-first-served; any taken slots are reported back and the parent can pick replacements.
6. **Confirmation** screen + email with full schedule and cancellation policy.

Cancellation: 24‑hour rule. Parents get a per-occurrence cancel link in the confirmation email; <24h cancellations are still charged.

## Admin

### New page: `/admin/private-lessons` (sidebar under Lessons)

Two tabs:

**Availability**
- For each instructor: list recurring weekly blocks (e.g. Mon 3–6pm) + one-off date blocks + blackouts.
- Add/edit/delete blocks. Inputs: instructor, day-of-week OR specific date range, start–end time, slot length (default 30 min), pool area, optional notes.
- Generated slots are computed on read (no separate slot table) by combining blocks − existing bookings − pool_events − blackouts.

**Bookings**
- Table of `lesson_bookings` where `lesson_type='private'` and `booking_source='self_serve'`. Filters: upcoming, past, cancelled. Row click opens existing `LessonRequestDetailDialog`-style drawer showing occurrences + charge status. Buttons: cancel occurrence, refund last charge, resend card-update link.

### Sidebar nav
Add "Private Lessons" item.

## Database

New table `instructor_booking_blocks`:
- `instructor_id`, `kind` ('weekly' | 'date_range'), `day_of_week` (nullable int 0–6), `start_date`/`end_date` (nullable), `start_time`, `end_time`, `slot_minutes` (default 30), `pool_area`, `is_blackout` (bool), `notes`, timestamps.
- RLS: admins manage; anon `SELECT` allowed (needed so public page can compute open slots without auth).

Extend `lesson_bookings`:
- `booking_source` text ('admin' | 'self_serve'), default 'admin'
- `stripe_customer_id` text
- `stripe_payment_method_id` text
- `cancellation_policy_hours` int default 24

Extend `lesson_booking_occurrences`:
- `auto_charge_status` text ('pending' | 'succeeded' | 'failed' | 'skipped'), default 'pending'
- `auto_charge_attempted_at`, `auto_charge_error`
- `stripe_payment_intent_id`
- `cancel_token` text unique (for one-click cancel emails)

New table `slot_holds` (for the brief window between "Pick slots" and "Card saved"):
- `id`, `instructor_id`, `slot_date`, `start_time`, `end_time`, `held_until` (now + 5 min), `session_token`. Cleaned on insert via "expired holds where held_until < now()". Used only to prevent thundering-herd double-book during the SetupIntent flow.

RLS: all new/extended rules keep current admin-only writes; public can `SELECT` blocks and `INSERT/DELETE` their own slot holds keyed by `session_token` (no auth).

## Stripe

New edge functions (all `verify_jwt = false`):
- `create-private-booking-setup` — input: parent info, selected slots, swimmer info, legal agreement payload. Validates slots are still open, creates `lesson_bookings` row + `lesson_booking_occurrences` rows in `pending_card` status, creates Stripe Customer (via `resolveOrCreateCustomer` keyed on email), returns a SetupIntent `client_secret` for embedded checkout in `setup` mode.
- `confirm-private-booking` — input: bookingId + setup_intent id. Verifies SetupIntent succeeded, stores `payment_method_id` on the booking, flips occurrences to `scheduled`, sends confirmation email.
- `charge-private-lesson-occurrence` — cron-style function, hit by `pg_cron` daily. Finds occurrences whose `occurrence_date = yesterday` and `auto_charge_status='pending'`, creates an off-session PaymentIntent for $65 using stored `payment_method_id`. Updates status; on failure, emails parent + admin.
- `cancel-private-lesson-occurrence` — token-authenticated, cancels one occurrence. If <24h before, marks `auto_charge_status` to charge as normal. If ≥24h, marks `skipped`.

Use `_shared/stripe.ts` `createStripeClient` for all Stripe calls.

Webhook (`payments-webhook`) — add handler for `setup_intent.succeeded` and `payment_intent.payment_failed` to mirror state.

## Files

**New**
- `src/pages/admin/PrivateLessonsAdmin.tsx`
- `src/components/admin/private-lessons/InstructorAvailabilityManager.tsx`
- `src/components/admin/private-lessons/PrivateBookingsTable.tsx`
- `src/components/admin/private-lessons/PrivateBookingDetailDrawer.tsx`
- `src/components/private-lessons/PrivateBookingFlow.tsx` (5-step wrapper)
- `src/components/private-lessons/SlotPicker.tsx` (calendar + chips + weekly toggle)
- `src/components/private-lessons/PrivateCardSetup.tsx` (Stripe embedded SetupIntent)
- `src/lib/privateBooking.ts` (slot computation, edge-fn callers)
- `supabase/functions/create-private-booking-setup/index.ts`
- `supabase/functions/confirm-private-booking/index.ts`
- `supabase/functions/charge-private-lesson-occurrence/index.ts`
- `supabase/functions/cancel-private-lesson-occurrence/index.ts`
- `supabase/functions/_shared/transactional-email-templates/private-booking-confirmation.tsx`
- `supabase/functions/_shared/transactional-email-templates/private-lesson-cancelled.tsx`
- `supabase/functions/_shared/transactional-email-templates/private-lesson-charge-failed.tsx`
- Migration: new tables + columns + RLS + grants

**Edited**
- `src/pages/SwimEnrollment.tsx` — replace the existing Request tab with the new Private booking flow + a simplified Semi-Private contact request form
- `src/components/swim-enrollment/LessonRequestForm.tsx` — trim to Semi-Private inquiry only
- `src/components/admin/AdminSidebar.tsx` — add "Private Lessons"
- `src/App.tsx` — route for `/admin/private-lessons`
- `supabase/functions/payments-webhook/index.ts` — handle setup/charge events
- `supabase/functions/_shared/transactional-email-templates/registry.ts` — register new templates
- `supabase/config.toml` — `verify_jwt = false` for new functions

## Out of scope
- Semi-private online booking (stays manual; new form is contact-only).
- Package pricing / discounts / multi-swimmer per booking.
- Rescheduling UI for parents (cancel + rebook only for v1).
- Instructor-side acceptance flow (admin manages availability, all bookings auto-confirm).
- SMS reminders.
