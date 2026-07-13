## Text Session 2 payment links via SMS

### Audience
Session 2 (period `b2222222…`, Jul 13 – Aug 5) has **21 enrollees** with an unpaid session fee AND a parent phone on file (out of 27 unpaid total — 6 have no phone and will need email instead).

### Approach
The per-enrollment function already exists: `text-session-payment-link` normalizes the phone, gets/creates the Stripe Payment Link, sends via TextMagic, and logs to `reminder_logs`. No new SMS code needed — just batch-fire it.

### What I'll build

1. **New edge function** `send-session-payment-link-sms-batch`:
   - Auth: admin JWT required (same pattern as `admin-charge-private-lesson-occurrence`).
   - Body: `{ sessionPeriodId, environment, dryRun? }`.
   - Query unpaid enrollments in that period with `parent_phone` present, skip anyone whose `session_fee_status` is `paid`/`comp` or `status` is `cancelled`.
   - For each row, invoke `text-session-payment-link`. Collect `{ enrollmentId, childName, phone, status, error }`.
   - Return counts + per-row results so the UI can show a summary.
   - Dry-run mode returns the recipient list without sending.

2. **Admin UI trigger** on the Session 2 admin view (Sessions or Enrollments admin):
   - Add a "Text unpaid families payment link" button.
   - First click opens a small confirmation dialog listing: total recipients, count with no phone (excluded), and a Send button.
   - On send: invoke the batch function, show a toast, then render a summary panel (sent / failed with reason).

### What I won't change
- `text-session-payment-link` message copy stays as-is (already friendly and includes STOP opt-out).
- No changes to Stripe Payment Link creation or the webhook.
- No changes to enrollment rows.

### Verification
- Run once in dry-run mode from the dialog to confirm the 21-person list looks right.
- Then send for real and confirm `reminder_logs` shows one row per recipient with `status='sent'`.

Want me to also send email fallbacks to the 6 unpaid families with no phone in the same click, or handle those separately?