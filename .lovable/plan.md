Approved with your answer and two conditions folded in. Revised plan below.

## Verified facts (read-only, nothing changed)

Three duplicate pairs, all 2026-08-01, all `status = active`, each pair sharing one Stripe customer but two subscriptions:

```text
Diego Barajas   aime121287@gmail.com   cus_UzdS2ScwEwlt93
  A 445d7734  sub_1TzfI92HpbBBx5lsGwASio1I  15:57:44  welcome 15:57:49
  B 3072573b  sub_1TzfIF2HpbBBx5lse4xdLTot  15:57:50  welcome 15:57:52
Reet Pattar     pattarpindu@gmail.com  cus_UeOY3wXMUcsT9Q
  A 9670a831  sub_1Tzh2u2HpbBBx5lsRLmxpPQZ  17:50:07  welcome 17:50:11
  B 141f787c  sub_1Tzh2x2HpbBBx5lsWbHapqIn  17:50:10  welcome 17:50:14
Gin Turnbow     ginturnbow@gmail.com   cus_UzgnP9KKnuP5C6
  A 828440b1  sub_1TzhV82HpbBBx5lsfhU7IHTL  18:19:17  welcome 18:19:24
  B 0e05b950  sub_1TzhVC2HpbBBx5lscKoZdAjW  18:19:21  welcome 18:19:24
```

- All six memberships have 8 `membership_occurrences`, every one `status = scheduled`. Each swimmer is on the deck twice.
- `email_send_log` shows two `membership-welcome` emails per family, one per row, all `sent`. Both manage links are in every parent's inbox.
- `memberships` has no `stripe_session_id` column; `pending_memberships` is `(id, payload, stripe_session_id, created_at)` with no claim column, which is the race.

## Phase 1 — HARD GATE: read Stripe Invoices, then stop

Open Stripe Billing > Invoices for the three customers above and record, per subscription, whether an invoice exists, its status, and its amount. `trial_end` plus `add_invoice_items` means the prorated first charge may have billed at creation or may be queued for the Sep 1 invoice.

Write the findings down and stop for confirmation. No cancellation, no refund, no database change happens in this phase. Six paid invoices means three refunds; zero paid means cancellation is clean.

Also for the duration of Phase 1 through Phase 3: the Join button stays off. Any new enrollment creates another pair and another shared session id that would block the unique index.

## Phase 2 — Dedupe (only after Phase 1 is confirmed)

For each pair, the duplicate is row B unless Phase 1 shows B's invoice is the paid one, in which case B becomes the keeper and A is treated as the duplicate.

1. Cancel the duplicate's Stripe subscription with no proration. Refund only invoices Phase 1 proved were charged.
2. Set that membership's 8 `membership_occurrences` to `status = 'cancelled'`. Not deleted, per your call: both surfaces filter on occurrence status, and cancelled leaves the record.
3. Keep the membership row: `status = 'cancelled'`, `stripe_subscription_id = NULL`, and a `notes` line naming the duplicate incident, the keeper's membership id, and the cancelled subscription id.
4. Send each parent one short plain email: here is your link, disregard the earlier duplicate. No explanation of the billing bug.

## Phase 3 — Database-level guarantees (Join stays off until this lands)

1. Add `stripe_session_id text` to `memberships`; backfill from `pending_memberships.stripe_session_id` matched via `payload.stripe_subscription_id`. Then verify all six rows matched and print the result. A null slips past a partial index and silently loses protection, so the index is not created until the backfill is confirmed complete.
2. `CREATE UNIQUE INDEX ... ON memberships (stripe_session_id) WHERE stripe_session_id IS NOT NULL` — valid only because Phase 2 nulled the duplicates' ids first.
3. Unique index on `memberships (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL`.
4. Add `claimed_at timestamptz` to `pending_memberships`. Completion claims atomically: `UPDATE pending_memberships SET claimed_at = now() WHERE id = $1 AND claimed_at IS NULL RETURNING *`. Zero rows means another request owns it, so this one waits and re-reads the subscription id rather than creating one.
5. Idempotency key `membership-sub-<pendingId>` on `stripe.subscriptions.create`, so a lost race returns the same subscription from Stripe.

Turn the Join button back on after this phase.

## Phase 4 — Capacity

1. Re-check slot capacity in `membership-completion.ts` immediately before `stripe.subscriptions.create`, aborting with a clear error if the slot is full. This is what prevents charging for a spot that is gone.
2. `BEFORE INSERT OR UPDATE` trigger on `memberships` as the backstop, counting `active`, `pending_cancel`, and `paused` against `standing_slots.capacity` with a row lock on the slot.

## Phase 5 — Environment

`PAYMENTS_ENV`, read server-side, is the only source. No origin check, no request-derived override of any kind. Sandbox testing, if ever needed, goes on a separate backend project with its own `PAYMENTS_ENV=sandbox`.
