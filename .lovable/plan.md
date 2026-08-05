# Monthly payment visibility before September 1

## First: what the webhook handles today

`payments-webhook` handles exactly these Stripe events:

- `checkout.session.completed` (routed by metadata: membership, membership_setup, registration_fee, session_fee, admin_phone_checkout, lesson_booking_occurrence, lesson_occurrence_multi, lesson_booking_series)
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.closed`
- `invoice.paid`
- `invoice.payment_failed`

The last five only append a row to the `membership_payment_events` ledger. They never touch `memberships`.

Specifically for the four you named:

| Event | Handled? |
|---|---|
| `invoice.payment_succeeded` | No. Only `invoice.paid` is handled (near-equivalent for subscription renewals, but not the same event name) |
| `invoice.payment_failed` | Yes, ledger insert only |
| `customer.subscription.updated` | No, falls to the default log-and-ignore branch |
| `customer.subscription.deleted` | No, falls to the default log-and-ignore branch |

So today a decline writes one ledger row that nothing in the admin UI reads, and `memberships` is untouched. On Sep 1 a declined card is invisible.

## 1. Schema (additive, nullable)

Add to `memberships`:

- `last_invoice_id text`
- `last_payment_status text`
- `last_payment_at timestamptz`
- `last_payment_amount_cents integer`
- `payment_failure_count integer not null default 0`
- `payment_failure_reason text`
- `stripe_subscription_status text` (what Stripe last reported, kept separate from the enrollment `status`)

No change to the `membership_status` enum. Enrollment status and payment status stay separate fields.

## 2. Webhook handlers

Add `invoice.payment_succeeded`, `customer.subscription.updated`, and `customer.subscription.deleted` to the switch, and extend the invoice cases to update `memberships` after the ledger insert.

- `invoice.payment_succeeded` and `invoice.paid` — set `last_invoice_id`, `last_payment_amount_cents` (from `amount_paid`), `last_payment_at`, `last_payment_status = 'paid'`, clear `payment_failure_reason`, reset `payment_failure_count` to 0. Both events are handled and the write is idempotent on invoice id, so a double delivery is harmless.
- `invoice.payment_failed` — set `last_invoice_id`, `last_payment_status = 'failed'`, `last_payment_at`, and `payment_failure_reason` from the decline text on the invoice's last payment error. Increment `payment_failure_count` only when the invoice id differs from the one already recorded, so Stripe redelivering the same failure does not inflate the count.
- `customer.subscription.updated` — record `stripe_subscription_status` when it changes. Nothing else.
- `customer.subscription.deleted` — record `stripe_subscription_status = 'canceled'` and a ledger row. The membership `status` is left alone.

Membership matching reuses the existing `stripe_subscription_id` then `stripe_customer_id` lookup already in `recordMembershipPaymentEvent`.

### Recommendation on `customer.subscription.deleted`

Do not auto-cancel, and I would not even auto-flag it as a cancellation request. Stripe deletes a subscription for three different reasons that mean very different things: a parent cancelled through the portal, we cancelled it during dedupe or a slot conflict, or Stripe exhausted dunning retries and closed it out. Only the third is a billing problem, and the first is usually already represented by a `membership_cancellations` row. The right behavior is to record the Stripe status, then surface it on the memberships list as an unresolved item ("Stripe subscription ended, membership still active") in the same banner as failed payments, and let a human close it out. Auto-cancelling would remove occurrences and drop a swimmer from the deck for what may be an internal cleanup.

## 3. Admin visibility on /admin/memberships

- A **Payment** column: `Paid <date>`, `Failed <date>` in red, or `Awaiting first charge` when there is no recorded payment. The existing status column is untouched.
- A **Payment** filter alongside the current program/status/day filters: All, Paid, Failed, Awaiting first charge.
- A **banner** above the table when any membership in the list has `last_payment_status = 'failed'` or a Stripe subscription status of `past_due` / `unpaid` / `canceled` while the membership is still active. It names the count and filters the table on click.
- **Detail view**: last payment date, amount, invoice id, and, on failure, the decline reason mapped to plain language (for example `insufficient_funds` becomes "The card did not have enough funds"), plus the raw Stripe reason underneath.

## 4. Backfill from the existing ledger

After the migration, backfill the new columns from `membership_payment_events`: for each membership, take the most recent `invoice.paid` / `invoice.payment_failed` row and write `last_invoice_id`, `last_payment_status`, `last_payment_at`, `last_payment_amount_cents`, and on a failure the reason. `payment_failure_count` is set to the number of consecutive failure rows since the last success.

One thing to set expectations on: `membership_payment_events` is currently **empty** (zero rows, confirmed by query). The handlers that write it went in recently and no recurring invoice has run yet. So the backfill will report 0 rows and every existing membership will show "Awaiting first charge", which is accurate. The backfill still ships so it is correct if any events land between now and the migration, and the count will be reported after it runs.

## 5. No parent-facing notification on failure

Confirmed as a design constraint and enforced in the implementation: none of the new handlers call `send-transactional-email`, the SMS path, or enqueue anything. A decline writes database fields and renders in admin only. I will re-verify by grepping the changed handlers for email/SMS call sites before shipping.

### Stripe dunning status

I cannot read the Stripe account's dunning setting from here — it lives in Billing settings on the Stripe account, not in anything the app stores or the API surfaces through the keys we hold. Retry schedule and "send email when payment fails" are dashboard toggles.

So this is a question for you rather than something I can report. My recommendation: leave Stripe dunning emails **on** and treat Stripe as authoritative for the parent-facing message. Stripe's email carries the hosted invoice link that lets the parent actually fix the card, which we would otherwise have to build. The admin banner is then not a duplicate notification, it is the internal signal that a parent has been asked to update their card and has not yet done so. If you would rather own the wording, we turn Stripe's off and add a parent email later as its own piece of work, but that should not go in this change.

Either way, the answer does not block the rest of the work. I will note it in the banner copy once you confirm which way it goes.

## 6. No auto-cancel

Nothing in these handlers writes `memberships.status`, deletes or alters `membership_occurrences`, or touches check-in or calendar queries. A failure sets display fields only.

## Out of scope

Pricing, proration, checkout, occurrence generation, check-in, and calendar are untouched.


## Verification

1. Replay a `invoice.payment_failed` for a live membership against the webhook: confirm `last_payment_status = 'failed'`, reason recorded, `payment_failure_count = 1`, and `status` still `active`.
2. Replay `invoice.payment_succeeded` for the same membership: confirm status flips to paid, reason cleared, count back to 0.
3. Load `/admin/memberships`: confirm the column, the filter, and the banner while a failure is present.
4. Snapshot `membership_occurrences` row count and the check-in and calendar queries before and after the failure replay and show they are identical.
5. Re-replay the same failed invoice event and confirm the failure count does not increment twice.
