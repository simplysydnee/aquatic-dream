# Diagnosis: our own code is cancelling brand new subscriptions

## 1. What Stripe says

All four cancellations were **API initiated by our own live key**, 2 to 6 seconds after the subscription was created, while trialing, with no failed invoice. Stripe records `cancellation_details.reason = cancellation_requested` and a request id with **no idempotency key** (our create call always sends one, our cancel call sends none).

| Swimmer | Subscription | Created | Cancelled | Gap | Cancel request |
|---|---|---|---|---|---|
| Weston Winkler | sub_1U1WSQ | Aug 6 18:55:58 UTC | 18:56:03 | 5s | req_fcXjsS7h121OhL |
| Nanki Kaurrh | sub_1U1ZyS | Aug 6 22:41:16 | 22:41:22 | 6s | req_jP5BbuL7L2Gshh |
| Aaron Sanchez | sub_1U1eIC | Aug 7 03:17:55 | 03:17:59 | 4s | req_8jDE1Zc54ND1KY |
| Amanat Pahal | sub_1U1ogs | Aug 7 14:24:06 | 14:24:11 | 5s | req_VZoTxSjcO6ar2b |

In every case the cancel timestamp equals the second the matching `memberships` row was inserted. Not Stripe, not the dashboard, not fraud rules. Our code.

## 2. Root cause — the Phase 4 capacity backstop, but not the way you guessed

The pre-flight check (`slotIsFull`, membership-completion.ts:82) is fine, and the DB trigger `enforce_membership_slot_capacity` correctly excludes the row being inserted (`m.id IS DISTINCT FROM NEW.id`). So an ordinary first-time private signup is not miscounted.

The failure is a **second completion attempt for a signup that already succeeded**. Two callers finish the same checkout (client `confirm-membership-checkout` and the `payments-webhook`, or a client retry):

1. Caller A inserts the membership row. Slot capacity 1 is now occupied. Correct.
2. Caller B replays the same pending id. Because `payload.stripe_subscription_id` is now set, it skips the claim/poll and goes straight to `ensureMembershipRecord`, which attempts a **second insert** for the same subscription.
3. That insert is meant to be caught by the unique index on `stripe_subscription_id` and reconciled onto the winning row (the `23505` branch at membership-completion.ts:578). It never gets there: the BEFORE INSERT capacity trigger fires **first** and raises `MEMBERSHIP_SLOT_FULL` (P0001), because caller A's row is a legitimate occupant of a capacity-1 slot.
4. The code reads that as "the slot filled during checkout", takes the slot-full branch at membership-completion.ts:607 and calls `stripe.subscriptions.cancel(options.subscriptionId)` — cancelling the live subscription belonging to the row that was just successfully created.

So the backstop cancels a real, paid-for subscription whenever a duplicate completion lands on a full slot. Capacity-1 private slots hit it hardest because a single successful signup makes the slot full by definition, so any replay is fatal. Nanki Kaurrh shows the same signup twice with two pending rows, which is why she has two active membership rows and one dead subscription.

**Yes, this is still live.** Any private signup whose completion is delivered twice can lose its subscription right now.

## 3. Full audit — six, not four

Checked every active/pending_cancel/paused membership against live Stripe rather than the cached `stripe_subscription_status` column (which is null on most rows because it only populates when a webhook event arrives — it cannot be trusted for this audit).

Broken, same signature:
- Weston Winkler — sub_1U1WSQ, canceled
- Nanki Kaurrh (7b327057) — sub_1U1ZyS, canceled. Duplicate row 7f57d445 has a healthy sub_1U1aLy, so this family occupies two capacity-1 private slots
- Aaron Sanchez — sub_1U1eIC, canceled
- Amanat Pahal — sub_1U1ogs, canceled
- **Destiny Godinez (new)** — sub_1U0VY0, kid_group, created Aug 2 and cancelled 4 seconds later by the same code path. Her first invoice **did pay** before the cancel, so she has been charged once and will never renew. DB shows `stripe_subscription_status` null, so she is invisible on the payment-problem filter today

Different problem, also broken:
- **Andrew Moore (new)** — `stripe_subscription_id` sub_1U05Hr does not exist in live Stripe; it is a **test-mode subscription** (found, trialing, in the sandbox account). A live membership is pointed at a sandbox subscription and will never bill

Everything else (18 memberships) is `trialing` and healthy.

## 4. What I recommend next, in order

1. **Stop the bleeding first (small, surgical):** in `ensureMembershipRecord`, before treating a `MEMBERSHIP_SLOT_FULL` error as a real capacity failure, look up whether a membership already exists for this `stripe_subscription_id` or `stripe_session_id`. If it does, this is a replay — reconcile onto that row and **never cancel**. Only cancel when no membership exists for the subscription. Optionally make the trigger message distinguish the replay case.
2. **Make cancel a last resort:** re-read the subscription before cancelling and skip it if it is already attached to a stored membership.
3. **Then** repair the six rows: restart billing for Weston, Nanki (7b327057), Aaron, Amanat, Destiny; repoint or re-create Andrew's subscription in live; and decide which of Nanki's two rows and slots is real.
4. Add a daily reconcile that compares every active membership against live Stripe and flags missing/canceled subscriptions, so this surfaces without the payment-problem column being populated by a webhook.

No code has been changed. Approve and I will do step 1 and 2 only, then come back before touching any family's billing.
