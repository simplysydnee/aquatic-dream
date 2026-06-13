# Add payment + card-on-file actions to the admin Private Lesson dialog

The Private Lesson popover (screenshot) has no payment controls. Add three actions to `PrivateLessonDetailDialog.tsx`.

## Buttons (above "Cancel lesson")

1. **Charge card on file** — shown when `lesson.stripe_payment_method_id` exists and `payment_status !== 'paid'`.
   - New edge function `admin-charge-private-lesson-occurrence` (admin-only): off-session PaymentIntent on the stored PM for `price_per_session`, then set occurrence `payment_status='paid'`, `auto_charge_status='charged'`, `stripe_payment_intent_id`. Mirrors the existing cron `charge-private-lesson-occurrence`, scoped to one row.

2. **Add card on file** — always shown when no PM is saved. Two sub-actions in a small popover:
   - **Enter card now (admin)** — opens an inline dialog with Stripe Embedded Checkout in `mode: setup` (reuses the existing `admin-create-private-booking-setup` pattern but for an existing booking). New thin edge function `admin-setup-card-for-booking` returns a setup-mode `client_secret` for the booking's Stripe customer; on completion a follow-up call attaches `stripe_payment_method_id` to `lesson_bookings` and flips occurrence `payment_status='card_on_file'`, `auto_charge_status='pending'`. Admin can collect the card with the client physically present.
   - **Email link to parent** — calls existing `admin-card-on-file-link` and copies the URL to clipboard so admin can also text it.

3. **Mark paid manually** — ghost button, confirm with method dropdown (cash/check/comp/zelle) + optional reference, writes occurrence `payment_status='paid'`, `auto_charge_status='skipped'`, `payment_method`, `payment_reference`.

## Files changed

- `src/components/admin/calendar/PrivateLessonDetailDialog.tsx` — 3 buttons + handlers + embedded-setup dialog mount.
- `src/components/admin/calendar/AdminCardOnFileDialog.tsx` *(new)* — wraps `EmbeddedCheckoutProvider` for the setup intent.
- `supabase/functions/admin-charge-private-lesson-occurrence/index.ts` *(new)* — admin-only one-shot charge.
- `supabase/functions/admin-setup-card-for-booking/index.ts` *(new)* — admin-only setup-mode session for an existing booking; on completion attaches PM.
- `supabase/config.toml` — `verify_jwt = false` entries for the two new functions (auth enforced in code).

## Verify

- Kiaan (no PM): dialog shows "Add card on file" → "Enter card now" launches embedded Stripe; saving a test card flips badge to "Card on file" and the "Charge card on file" button appears.
- Booking with PM: clicking "Charge card on file" charges $price_per_session and badge becomes "Paid".
- "Email link to parent" still works as before.
- "Mark paid manually" with cash records correctly.

No schema migration needed — all columns exist on `lesson_booking_occurrences` and `lesson_bookings`.
