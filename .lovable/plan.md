# Attach and charge on /admin/card-gaps

Make the card gap report actionable: one confirmed action per row that attaches the family's card on file, charges the lesson through the existing charge function, and emails a receipt.

## What exists already (no rebuild)

- `admin-setup-card-for-booking` action `check` resolves the family's newest valid card via `_shared/card-on-file.ts`; action `attach_existing` re-validates it in Stripe and writes `stripe_customer_id` and `stripe_payment_method_id` onto the booking.
- `admin-charge-private-lesson-occurrence` charges one occurrence off-session, rejects already-charged rows with 409, and uses the `occ_<occurrence_id>` idempotency key.
- `send-transactional-email` (Resend) with `email_send_log` and an idempotency key.

Only the receipt template and the page UI are new.

## 1. Row action

Each row gets one button, "Attach card and charge". Clicking it runs `check` against the booking to resolve and validate the card, then opens a confirm dialog. If validation fails (no card, wrong type, expired, detached), the row shows the reason inline and no dialog opens. No silent fallback to a different card.

## 2. Confirm dialog

Shows swimmer, lesson date with day of week, start time, instructor, amount, and card brand plus last four. One confirm button per row. Nothing charges on page load, and there is no bulk action.

On confirm:
1. `attach_existing` with the resolved source booking, writing the customer and payment method onto the booking.
2. `admin-charge-private-lesson-occurrence` for the occurrence.
3. On success, fire the receipt.

## 3. Amount

Comes from the same promo-aware pricing the charge function already uses, so the dialog and the charge agree. Today that is $50 per lesson: 8 occurrences, $400 total across Gurpreet Singh $150, Gurdip Pahal $100, Leonel Valencia jr $100, Fred Mendoza $50.

## 4. Idempotency

The existing guard stands. A second attempt on an occurrence already marked succeeded or carrying a payment intent returns "already charged" and is surfaced as such, not retried.

## 5. Results and refresh

Each row shows either success with the payment intent id, or the failure reason. After each attempt the report refetches so charged rows drop off the list.

## 6. Receipt email

New template `lesson-charge-receipt`, sent immediately after each successful charge, one per lesson (three lessons means three receipts, each naming its own date).

Contains swimmer name, lesson date with day of week and start time, instructor name, amount charged, card last four, the line explaining this lesson was booked without a card on file and has now been charged to the card on file for the family, and the contact phone (209) 577-3483.

Subject: `Aquatic Dreams receipt — Nanki's lesson Tue Aug 4, 5:30 PM`.

Idempotency key `lesson-charge-receipt:<occurrence_id>` so the same occurrence can never receive two receipts; `email_send_log` records every send.

If the receipt fails, the charge stands. The results panel shows "Charged, receipt failed" with the reason so the front desk follows up. No reversal on an email failure.

## Technical notes

- Edit `src/pages/admin/CardGapReport.tsx`: add per-row state (idle, checking, ready, charging, done, error), the confirm dialog, and the results column. Booking `start_time` and `instructor_name` are pulled into the existing query for the dialog and receipt.
- New `supabase/functions/_shared/transactional-email-templates/lesson-charge-receipt.tsx` plus a registry entry, with a subject function reading swimmer, date, and time.
- Receipt send goes through a thin server step so the swimmer/date/amount/last four come from the charged row rather than client input.
- No changes to the charge function's money logic, the card-on-file helper, membership code, /join, or Stripe environment handling.

## Verification

1. Attach writes customer and payment method to the booking.
2. Charge produces a payment intent and flips `payment_status` to paid.
3. A repeat attempt returns already charged, no second intent.
4. An expired or detached card fails with a readable reason and no charge.
5. One receipt per successful charge, logged, never duplicated.
