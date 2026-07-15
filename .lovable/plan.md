
## Problem

Private lessons in July should charge **$50** (Summer Special promo, active Jun 1 – Aug 31 2026), but admin charge actions are billing **$65**. The promo-aware helper `getPrivateLessonPrice(lesson_type, occurrence_date)` already exists in `_shared/private-lesson-pricing.ts` and is correctly used by the cron charger and public checkout, but three admin/manual paths still read the stale `price_per_session` value that was locked on the booking row when it was created (before the promo window, or for bookings created with the regular price stored).

## Files to change

### 1. `supabase/functions/admin-charge-private-lesson-occurrence/index.ts`
- Import `getPrivateLessonPrice` from `../_shared/private-lesson-pricing.ts`.
- Replace `const amount = Math.round(Number(b.price_per_session) * 100)` with a promo-aware calc using `b.lesson_type` and `row.occurrence_date`.

### 2. `supabase/functions/admin-manage-private-booking/index.ts` (`charge_occurrence` branch, ~line 99)
- Import `getPrivateLessonPrice`.
- Replace `Number(b.price_per_session || 65) * 100` with promo-aware calc using `b.lesson_type` and `occ.occurrence_date`.

### 3. `supabase/functions/send-lesson-series-confirmation/index.ts` (series payment link, ~line 50-78)
- Compute per-occurrence prices via `getPrivateLessonPrice(booking.lesson_type, o.occurrence_date)`.
- Build one Stripe `line_item` per occurrence (or group identical unit_amounts) instead of `unit_amount = price` × `quantity = occs.length`, so mixed promo/non-promo series total correctly.

### 4. `src/components/admin/swimmer/tabs/PaymentsTab.tsx` (Payments tab UI)
- Replace `Number(lb?.price_per_session ?? 0)` reads at lines 122, 374, 405 with `getPrivateLessonPrice(lb?.lesson_type, o.occurrence_date)` so displayed amounts, unpaid totals, and the "Email combined link" total all show $50 on promo dates. Semi-private stays $45 automatically.

Deploy the three edge functions after edits.

## Retry July 14 failed charges

After the code is deployed:

1. Query `lesson_booking_occurrences` for `occurrence_date = '2026-07-14'` where `payment_status != 'paid'` and `charge_status IN ('failed', NULL)` and the booking is `private`/`semi_private`. Show the list (child, parent, booking id, occurrence id, current price_per_session, prior error) for confirmation.
2. For each confirmed row, invoke `admin-charge-private-lesson-occurrence` — now billing the correct $50 (or $45 semi-private). Report success/failure per row.

## Out of scope

- Not changing the stored `price_per_session` column on existing `lesson_bookings` rows (would ripple through history/reporting). The helper overrides at charge time and in the UI, which is enough.
- Not touching public booking flow, cron charger, or confirmation emails — they already use `getPrivateLessonPrice`.
- Regular price constant stays $65; only the promo window path is affected.
