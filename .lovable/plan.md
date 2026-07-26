## What I found in the database

Checking the flagged names against `lesson_booking_occurrences` (past, non-cancelled, non-test):

| Family | Lessons in question | Card on file | Current DB state |
|---|---|---|---|
| Amanat Pahal | 6/16 | Yes | scheduled, `card_on_file`, uncharged |
| Cindy Castillo | 6/8, 6/15, 6/22 | No | unpaid |
| Sierra Perez | 6/15, 6/22, 6/29 | No | unpaid (6/8 already marked paid) |
| Diego Capistran | 7/13, 7/20 | No | unpaid, `charge_status=skipped` |
| Ryker (sutton@icanswim209.com) | 5/12, 5/19 | No | test booking |
| Ryker Lucas | 6/16 | No | already abandoned |
| Holden Hamby | 5/5 | No | unpaid (5/4 and 5/6 already paid) |
| Maria Reyes | 7/25 | No | unpaid, $10 row |
| Remi Hein | 7/2 (two duplicate bookings) | No | one unpaid, one already paid |

## Plan

### 1. Stripe invoice audit (read only, reported in chat)
Query Stripe for all invoices belonging to `cindycastillo9109@gmail.com`, `sierrabperez@gmail.com`, and `dcgiovanny@gmail.com`. For each invoice I will report: amount, created date, status (draft / open / paid / void / uncollectible), whether it was actually sent (finalized and emailed), and the hosted invoice URL.

Actions based on status:
- **Draft** — never sent. Finalize and send it.
- **Open** — sent but unpaid. Re-send the invoice email. No lesson status change.
- **Paid** — mark the matching lesson occurrences `paid` with the invoice's charge/payment intent as the reference, and attach the card used (see step 2).
- **Void / none found** — report back so you can decide.

### 2. Save cards from paid invoices
For any invoice that was paid with a reusable card, attach that `customer` + `payment_method` to that family's `lesson_bookings` rows that currently have no payment method, so future lessons show "card on file" and are chargeable. Existing payment methods are never overwritten.

### 3. Reconcile the resolved items
Direct data updates:
- **Amanat Pahal 6/16** — mark cancelled (called out), `charge_status = skipped`, so it drops off the unbilled list.
- **Ryker** (both records) — mark the bookings and occurrences `abandoned` / test so they disappear from schedules and audits. Rows are not deleted, per the no-delete rule.
- **Holden Hamby 5/5** — mark paid, `payment_method = cash`.
- **Maria Reyes 7/25** — mark the occurrence rescheduled/cancelled so it stops showing as owed. Tell me the new date if there is one and I will point it there instead.
- **Remi Hein 7/2** — void the duplicate unpaid booking (`abandoned`), keep the already-paid row as the real lesson.

### 4. One-time batch charge edge function
New `admin-charge-lesson-occurrences-batch` function, admin-authenticated, modeled on the existing `admin-charge-private-lesson-occurrence`:
- Accepts an explicit array of occurrence IDs plus `dryRun`.
- Per occurrence: skips anything already paid or already holding a payment intent, resolves the card (with the existing sibling-card fallback by parent email), prices via `getPrivateLessonPrice`, and creates an off-session PaymentIntent with idempotency key `occ_<id>`.
- Writes the charge record first, then the paid stamp, exactly like the single-occurrence function.
- Returns a per-occurrence result table (charged / skipped / failed with reason).

I will run it in `dryRun` first, show you the list and totals, and only run the real charges after you confirm. Remi Hein's remaining lesson will be included once the duplicate is voided, along with any of the invoiced families that turn out to have a saved card and no paid invoice.

### 5. Front-end
No new UI. The existing calendar, print schedule, and billing views read the same statuses, so they update automatically once the rows are reconciled. I will re-run the unbilled audit afterward and give you the clean list.

## Technical notes
- Stripe calls go through `createStripeClient` in `_shared/stripe.ts` (live env for these).
- Card lookup reuses `findReusableCardForEmail` from `_shared/card-on-file.ts`.
- Data corrections use insert/update statements, not migrations; no rows are deleted and no RLS policy changes.
