## Problem

The edge functions now charge the correct $50 promo price for July private lessons, but three admin UI surfaces still **display** the stale `price_per_session` value ($65) from the booking row. So the "Charge $65" button and confirmation totals scare admin off — even though Stripe would actually bill $50.

## Files to change

Replace every stale `price_per_session` read on the calendar surfaces with the promo-aware helper `getPrivateLessonPrice(lesson_type, occurrence_date)` from `@/lib/privateLessonPricing`.

### 1. `src/components/admin/calendar/PrivateLessonDetailDialog.tsx`
Four spots:
- Line 195 (`amountLabel: \`$${lesson.price_per_session}\``) — pass promo-aware amount for the emailed card-on-file link.
- Line 320 (Price row display) — show promo price with a small "Summer Special" note when applicable.
- Line 390 (`Charge $${lesson.price_per_session}` button label) — must read $50 for July.
- Line 546 (`amount={Number(lesson.price_per_session) || 0}` passed to `ChargeConfirmDialog`) — pass promo amount.

### 2. `src/components/admin/calendar/ChargeAllDialog.tsx`
Line 118: compute `price` per row via `getPrivateLessonPrice(b?.lesson_type, r.occurrence_date)` instead of `Number(b?.price_per_session ?? 0)`. Total (line 146) and per-row displays then show $50 for July privates automatically.

### 3. Sanity sweep
Grep the calendar folder and swimmer PaymentsTab one more time for any remaining `price_per_session` UI reads and swap them the same way. PaymentsTab was already updated in the last pass, but re-verify.

## Out of scope

- No backend changes (edge functions already correctly charge promo price).
- Not backfilling `lesson_bookings.price_per_session` — the helper is the single source of truth at display + charge time.
- No changes to group swim session pricing.

## Verification

After the edit, open a July 14 private lesson block on `/admin`:
- Price row shows **$50** (with Summer Special note).
- Charge button reads **Charge $50**.
- ChargeConfirmDialog total reads **$50**.
- "Charge all today" dialog totals reflect $50 per private, $45 per semi-private.
