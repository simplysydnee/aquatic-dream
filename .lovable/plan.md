## Goal
Run a June 2026 promo: every **private** lesson with a session date between June 1–30, 2026 is **$50** instead of the regular $65. Semi-private ($45) is unchanged. The promo is applied **per occurrence date** — a recurring series that straddles June/July charges $50 for June dates and $65 for July dates. The UI shows the promo clearly with strikethrough pricing and a "June Special" badge.

## Changes

### 1. Single source of truth for private-lesson pricing
Add a shared helper `getPrivateLessonPrice(occurrenceDateISO)` in two places (client + edge function), since edge functions can't import from `src/`:

- `src/lib/privateLessonPricing.ts` — used by all React components.
- `supabase/functions/_shared/private-lesson-pricing.ts` — used by all edge functions.

Both contain the same rule:
```text
if lesson_type == 'private' and date in [2026-06-01, 2026-06-30]: return 50
else if lesson_type == 'private': return 65
else if lesson_type == 'semi_private': return 45
```

Also export `JUNE_PROMO_ACTIVE_FOR_TODAY` (boolean) and `isJunePromoDate(dateISO)` for marketing copy.

### 2. Charge-time enforcement (authoritative)
The promo must be applied where money actually moves, so a stale `price_per_session` value can't overcharge a June date.

- **`supabase/functions/charge-private-lesson-occurrence/index.ts`** — replace `Number(b.price_per_session || 65)` with `getPrivateLessonPrice(b.lesson_type, row.occurrence_date)`. (Add `lesson_type` to the `select()` join.)
- **`supabase/functions/create-lesson-occurrence-checkout/index.ts`** — when building the line item, use `getPrivateLessonPrice(booking.lesson_type, occurrence.occurrence_date)` instead of reading `price_per_session` directly.

This guarantees: **no June occurrence is ever charged more than $50, even on bookings created before June.**

### 3. Booking creation
- **`supabase/functions/create-private-booking-setup/index.ts`** — set `price_per_session` to the price for the **first** occurrence date (so the stored value matches what most lessons in the series will cost). Acceptable because charge-time logic is the real source of truth.
- **`supabase/functions/admin-create-private-booking/index.ts`** — same: price the booking row by the first occurrence date; remove the hardcoded `defaultPrice = 65`.

### 4. Public booking UI — show promo
- **`src/pages/BookPrivateLesson.tsx`** — hero copy: when promo is active for today, show "~~$65~~ **$50** per 30-min lesson · June Special". SEO title/description swap to "$50 (June Special)".
- **`src/components/private-lessons/PrivateBookingFlow.tsx`** — header copy + the "$ total" line in the slots panel use per-slot pricing via the helper (sum each selected slot's date through `getPrivateLessonPrice`). Show strikethrough $65 next to $50 when any selected June slot triggers the promo.
- **`src/components/private-lessons/SlotPicker.tsx`** — same: the total line at the bottom sums per-slot prices, and each slot tile in June shows a small "June $50" badge.

### 5. Admin manual booking UI
- **`src/pages/admin/PrivateLessonsAdmin.tsx`** — in the "Book a lesson here" dialog, prefill the price input with the helper based on the chosen date and lesson type. Show a small "June promo — $50" hint when applicable.

### 6. No DB migration
The promo lives in code, not data. We do not change the `lesson_bookings.price_per_session` default (still 65) — it stays as a snapshot. The charge/checkout helpers override at the moment of payment.

## Technical notes
- Helper is pure: `(lessonType: 'private' | 'semi_private', occurrenceDateISO: string) => number`. Comparing date strings as `'2026-06-01' <= d && d <= '2026-06-30'` avoids any timezone bugs.
- We deliberately do not mutate existing `price_per_session` on already-created bookings. Charge code reads the helper, not the column, for private lessons.
- Semi-private path untouched (still $45) — helper returns 45 when `lesson_type === 'semi_private'` regardless of date.
- To extend or end the promo later, edit the two helper files only.

```text
Money flow with this change
───────────────────────────
Booking created          price_per_session column = price(first_date)   ← snapshot
                          ↓
Day-of auto-charge       amount = price(lesson_type, occurrence_date)   ← authoritative
Admin "Charge in person" amount = price(lesson_type, occurrence_date)   ← authoritative
```
