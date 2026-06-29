## Diagnosis

Fadwa Ziadeh (fadwasarama@yahoo.com) has 4 active lesson_bookings under the same email:

| Booking | Swimmer | Created | Stripe PM |
|---|---|---|---|
| de6ef3a7 | Adnan | 6/20 17:23 | ✅ pm_1Tn0Wq…N1MKK9kr (cus_UmZftq…) |
| 61e83e0b | Adnan | 6/20 17:24 | ❌ NULL |
| dcf2b533 | Mustafa | 6/27 19:07 | ❌ NULL |
| 2dca5cd8 | Adnan | 6/27 19:07 | ❌ NULL |

The 11:00 "Paid" row is `de6ef3a7` (only booking with a card). The 11:30 "Unpaid" row is one of the no-card siblings — that's why the charge fails with "no card on file" even though the parent just paid with a valid card.

This is the same sibling-booking pattern we backfilled previously for 6 other families. Adnan's family was created after that sweep, so they need a fresh pass — and the charge function still doesn't auto-recover.

## Plan

### Step 1 — Backfill Ziadeh family (immediate fix)
Re-validate `pm_1Tn0Wq2HpbBBx5lsN1MKK9kr` on `cus_UmZftq97GO7Jg0` in Stripe (attached, card, not expired) using the existing `findReusableCardForEmail` helper. If valid, stamp the 3 NULL bookings (61e83e0b, dcf2b533, 2dca5cd8) with that customer + PM and flip their non-paid, non-cancelled occurrences to `payment_status='card_on_file'`, `charge_status='pending'`, `charge_error=null`. This unblocks the 11:30 charge today.

### Step 2 — Auto-attach sibling card inside `admin-charge-private-lesson-occurrence`
Prevent recurrence. Inside the charge function, when a booking has no `stripe_payment_method_id` and no `stripe_customer_id`, call `findReusableCardForEmail(parent_email)` from `_shared/card-on-file.ts` (same helper the admin reuse banner uses). If a valid sibling card is found:
- stamp it on the booking
- flip non-paid pending occurrences for that booking
- proceed with the charge in the same request

If no reusable card is found, return the existing "no card on file" error unchanged. No behavior change for bookings that already have a card.

### Step 3 — Verify
After deploying, re-trigger the 11:30 charge for Adnan via `admin-charge-private-lesson-occurrence`. Confirm a `payment_intent_id` comes back and the row flips to Paid. Then spot-check that Mustafa's and Adnan's 6/27 bookings now show a card on file in the admin UI.

## What this does NOT change
- No change to the public self-serve booking flow.
- No change to the admin booking wizard or in-person card setup banner (those already reuse sibling cards).
- No change to RLS, schema, or the shared helper itself.
- Does not touch `de6ef3a7` (already paid and stamped).

## Files touched
- `supabase/functions/admin-charge-private-lesson-occurrence/index.ts` — add the pre-charge sibling-card lookup.
- One-off SQL via psql/edge invoke for the 3-row backfill (no migration needed; the columns already exist).
