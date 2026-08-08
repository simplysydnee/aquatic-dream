# Approved scope: stop the bleeding, prove it, explain the webhook gap

Only steps 1 and 2 from the diagnosis. No family's billing is touched. No "Fix payment" or "Restart billing" UI. I come back with the concurrency proof and the webhook answer before any repair.

## 1. Suppress the cancel when it is provably a replay

In `supabase/functions/_shared/membership-completion.ts`, inside the `isSlotFullDbError` branch of `ensureMembershipRecord`:

Before doing anything else, look up an existing membership by the exact `stripe_subscription_id`, and if that misses, by the exact `stripe_session_id`. If either finds a row:

- Treat it as a replay of a completion that already succeeded.
- Reconcile onto that row exactly as the `23505` unique-index branch does today (return the existing membership id, run the same idempotent post-steps, no duplicate occurrences, no duplicate welcome message).
- Do **not** call `stripe.subscriptions.cancel`. Log it distinctly as `replay_reconciled` so it shows up in function logs.

If neither lookup finds a row, nothing changes: it is a genuine capacity conflict between two different subscriptions and the existing reject-plus-cancel behaviour runs unmodified. Phase 4 keeps doing its job.

## 2. Make cancel a last resort

Immediately before the cancel call in that same branch, re-read the subscription from Stripe and skip the cancel if it is already attached to any stored membership (match on `stripe_subscription_id`). Cancel only when the subscription is genuinely orphaned. Any cancel that does fire logs the subscription id, the slot id, and the reason.

## 3. Concurrency proof, same standard as the Aug 1 fix

Not a description. A watched run.

- Flip `PAYMENTS_ENV` to `sandbox` (which now blocks all non-admin `/join` checkout, so public traffic cannot create a test membership while the flag is flipped).
- Create a throwaway inactive capacity-1 private slot in sandbox, plus one pending membership.
- Fire two completions against the **same pending id** concurrently, the shape that produced the six failures: one via `confirm-membership-checkout`, one via the webhook path.
- Confirm, from Stripe and the DB, all of:
  - exactly one membership row exists,
  - its subscription is still `trialing` in Stripe, with **zero** `customer.subscription.deleted` events on it,
  - the losing caller returned a clean reconcile, not an error,
  - no duplicate occurrences, no duplicate welcome message.
- Then run the negative case: two **different** subscriptions racing for the same capacity-1 seat. The second must still be rejected and its subscription cancelled. Phase 4 unbroken.
- Flip `PAYMENTS_ENV` back to `live` and confirm live checkout works before finishing.

I report the actual before/after Stripe event lists and row counts, not a summary.

## 4. Why `customer.subscription.deleted` never populated the column

The handler does exist and is wired up (`payments-webhook/index.ts:140`, `recordSubscriptionStatus` at :1098). It updates `memberships.stripe_subscription_status` by matching on `stripe_subscription_id`. Two candidate explanations, and I will determine which it actually was rather than guess:

- **Timing / zero-row update.** The cancel fires 4 to 6 seconds after creation, in the same request cycle that is still writing the membership row. If `stripe_subscription_id` was not yet stored (or the winning row stored a different one, which is exactly Nanki's shape) the update matches **zero rows**. Supabase returns no error for a zero-row update, so the handler logs a cheerful success line and nothing changes. That would make it silently useless for precisely the failure mode it was meant to catch.
- **Event not subscribed.** The live Stripe endpoint may not have `customer.subscription.deleted` in its enabled events, in which case the handler never ran at all.

I will check both directly: the live endpoint's enabled event list, and the webhook logs for these six subscription ids around their cancellation timestamps. If it is the zero-row case, the fix is to make `recordSubscriptionStatus` assert on rows affected and log loudly (and fall back to matching via the pending/session record) rather than adding a daily reconcile to paper over it. I will report the finding before proposing that change.

## 5. The six, for the record only. No action this pass.

- **Weston Winkler, Nanki Kaurrh (7b327057), Aaron Sanchez, Amanat Pahal** — same shape: subscription cancelled inside trial, nothing ever charged. Backend reconnect once the cause is closed.
- **Destiny Godinez — handled separately, not in the batch.** Her first invoice **paid** before the cancel, so money moved once and then billing died quietly. Her family reasonably believes they are enrolled and paying, and on Sept 1 nothing will charge. This is a trust issue before it is a billing issue and warrants a call, not a silent backend reconnect. I will surface her as her own item with the charge date and amount so Audrey can decide how to reach out.
- **Andrew Moore** — not a new case. Same open item as before: live membership pointed at a sandbox subscription, waiting on Audrey's courtesy call and the live-card swap.

## Technical notes

- Files touched this pass: `supabase/functions/_shared/membership-completion.ts` only.
- No migrations. No changes to `enforce_membership_slot_capacity`. No changes to the unique index.
- No UI work.
- Sandbox artifacts (throwaway slot, test memberships) are cleaned up after the proof.
