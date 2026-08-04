# Membership payment reconciliation

## First: what the webhook handles today

`payments-webhook` handles exactly **one** Stripe event: `checkout.session.completed`. Everything else hits the default branch, logs "Unhandled event", and returns 200.

So:
- `charge.refunded` — not handled
- `charge.dispute.created` — not handled
- `invoice.paid` / `invoice.payment_failed` — not handled
- `customer.subscription.updated` / `.deleted` — not handled

A refund, dispute, failed renewal, or manual dashboard charge never reaches the database. That is the whole drift.

Second finding worth stating up front: **memberships carry no payment columns at all.** There is no `payment_status` on `memberships` and none on `membership_occurrences`. All money state lives only in Stripe. So section (b) and (c) below compare Stripe against membership *lifecycle* state (status, period dates, subscription id), not against a payment flag that does not exist.

## Retry loop

Two retry paths, one of them fits the "four attempts in three minutes on the same invoice" pattern:

1. `src/pages/JoinMembership.tsx` — after checkout return it calls `confirm-membership-checkout` on a **fixed 3 second interval for up to 120 seconds** (up to 40 calls). Each call can enter the subscription-create path.
2. Stripe's own webhook redelivery when `payments-webhook` throws.

The subscription create in `_shared/membership-completion.ts` uses a stable idempotency key, which is why this produced repeated *declines* on the same invoice rather than duplicate subscriptions. The fix is backoff on the client poll plus a decline short-circuit on the server.

## What gets built

### 1. Reconciliation report — `/admin/payment-reconciliation`

New read-only admin page backed by a new edge function `reconcile-membership-payments` (verify_jwt = true, admin role checked). It pulls Stripe charges for the trailing 60 days and memberships/occurrences for the same window, compares in memory, returns three arrays. It performs **zero writes**.

**(a) In Stripe, not in our records** — succeeded charges in the window where `metadata.membership_id` / `metadata.pending_membership_id` matches no row, or the charge has no metadata, or its subscription id matches no membership. Catches dashboard charges and lump-sum prepayments.

**(b) In our records, not in Stripe** — memberships marked active (or paused with a paid period) whose current billing period has no succeeded charge or paid invoice in Stripe, and memberships whose `stripe_subscription_id` does not resolve in Stripe.

**(c) Contradictions** — membership status vs Stripe subscription status disagreement (active here / canceled, unpaid, incomplete, or past_due there; cancelled here / still billing there), and any membership whose latest invoice charge is refunded or disputed while the membership is still active.

Each row renders: swimmer, parent email, amount, date, what disagrees, a deep link to the Stripe object (`dashboard.stripe.com/payments/<id>` or `/subscriptions/<id>`, live or test per environment), and a link to the membership record. Nothing is editable. Sidebar entry added under the admin nav.

### 2. Webhook: refunds and disputes

Add to `payments-webhook`:
- `charge.refunded` and `charge.dispute.created` (plus `charge.dispute.closed`)
- `invoice.payment_failed` and `invoice.paid` for membership subscriptions

These do not mutate money and do not touch pricing. They append to a new append-only ledger table `membership_payment_events` (event id unique for idempotency, membership id, type, amount, currency, stripe object id, raw status, created at). The reconciliation report reads it, and the admin page surfaces refunds and disputes as unresolved items. Membership rows themselves are not auto-corrected.

### 3. Retry backoff

- `JoinMembership.tsx`: replace the fixed 3 s poll with exponential backoff — 2 s, 4 s, 8 s, 16 s, capped at 30 s, same 120 s overall deadline. Attempt count drops from ~40 to ~8.
- `_shared/membership-completion.ts`: when `subscriptions.create` fails with a hard card error (`card_declined`, `card_velocity_exceeded`, `insufficient_funds`), record the decline on the pending row and return a terminal decline result instead of a thrown error, so neither the client poll nor Stripe webhook redelivery re-attempts the same invoice within the window.

## Technical notes

- New table `membership_payment_events` with GRANTs (`select` to authenticated, `all` to service_role), RLS admin-read + service_role-write. This is the only schema change.
- Stripe access via `createStripeClient(env)` from `_shared/stripe.ts`, environment from server-side `PAYMENTS_ENV`.
- Report is fetched on demand through React Query; a "Refresh" button re-runs it. No cron.
- `lesson_bookings` is explicitly excluded from every query in the report.

## Verification

1. Run the report for the trailing 60 days and confirm a clean response.
2. Confirm a known orphan charge lands in section (a).
3. Confirm a known contradiction lands in section (c).
4. Snapshot row counts and `updated_at`/status values on `memberships`, `membership_occurrences`, and `pending_memberships` before and after a report run and show they are identical.
