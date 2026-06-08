## 1. Fix the frozen "Charge card in person" popup

**Root cause:** Console shows `Stripe.js api key mismatch detected`. The preview is loading `pk_test_…` from `VITE_PAYMENTS_CLIENT_TOKEN`, but `src/lib/stripe.ts` hard-codes `environment = 'live'`, so the edge function creates the Checkout Session against the **live** Stripe account. Live session + test publishable key → Stripe blocks the iframe, which is why the form never lets you submit.

**Fix:** Derive the environment from the token prefix in `src/lib/stripe.ts`:
- `pk_live_` → `'live'`
- `pk_test_` → `'sandbox'`

That way the preview (test key) talks to sandbox Stripe and the deployed site (live key) talks to live Stripe. No other code changes needed — `PhoneCheckoutPanel`, `LessonOccurrenceCheckoutDialog`, and `EnrollmentCheckout` already pass `getStripeEnvironment()` through.

## 2. Cash / check no longer require a reference — email a receipt instead

In `AddSwimmerDialog.tsx` (and the "Mark paid" path in `SwimEnrollmentsAdmin.tsx`):
- Remove the hard requirement on `payment_reference` for `cash` / `check` / `comp` / `walk-in`. Field stays optional for internal notes.
- Add a "Email receipt to parent" checkbox (default **on**) shown whenever payment_method is cash or check and status is paid.
- New edge function `send-cash-receipt-email`:
  - Inputs: `enrollment_id`, `amount_cents`, `payment_method`, optional `note`.
  - Sends a Resend transactional email to `parent_email` using the existing transactional template style (Aquatic Dreams letterhead): "Payment received — $X via cash/check for [child] / [session]", date, internal reference if provided.
  - Logs to `email_send_log` with `kind='cash_receipt'`.
- `admin-create-enrollment` and the mark-paid flow trigger the function when the checkbox is on.

Audit trail is preserved by the email log + the existing `payment_method` / `payment_status` / timestamps on `swim_enrollments`. The Stripe link / Stripe phone paths are untouched.

## 3. Swimmer check-in

The pieces already exist but are hard to find:
- `/kiosk` (KioskCheckIn) — tablet self-check-in by tapping a name.
- `CalendarBlockDetail` — per-class admin check-in inside the calendar.

Changes:
- **Admin sidebar entry "Check-in"** under Operations, opening a new `/admin/checkin` page: today's classes grouped by time, each swimmer with a one-tap check-in/undo button, search box, late/no-show buttons. Backed by the same `attendance` upsert the kiosk uses (`checked_in_by='admin:<email>'`).
- **"Open kiosk" button** on that page that links to `/kiosk` and opens fullscreen — for the tablet at the front desk.
- Show check-in counts (e.g. "2 / 3 checked in") on the calendar day cards so staff can see at a glance without opening each class.

## Technical notes
- `src/lib/stripe.ts`: switch the hard-coded `'live'` to a derived `paymentsEnvironment()` per the prefix.
- New file: `supabase/functions/send-cash-receipt-email/index.ts` (uses existing Resend setup + transactional template helpers in `_shared/transactional-email-templates/`).
- New file: `src/pages/admin/CheckInAdmin.tsx` + route in `AdminLayout`.
- Update: `AddSwimmerDialog.tsx`, `SwimEnrollmentsAdmin.tsx` (cash receipt UI + drop reference requirement), `CalendarDayView.tsx` (checked-in count badge).
- No schema changes needed.
