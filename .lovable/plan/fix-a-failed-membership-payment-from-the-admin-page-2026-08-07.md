# Fix a failed membership payment from the admin page

Today the payment problem banner only filters the list. There is no way to get a new card on a membership or to retry the failed charge. This adds both.

## What staff will see

On any membership row with a payment problem (and in the row's detail area), a new **Fix payment** button opens a small dialog with:

- The plain reason the bank gave, the amount, and the date of the failed charge.
- **Text or email the parent a card update link** — sends a secure Stripe card update page to the phone and email already on the membership. The dialog also shows the link so staff can copy it and read it out on the phone.
- **Enter card at the front desk** — card fields right in the dialog for in-person entry, using Stripe's secure card form (card numbers never touch our app or database).
- A short history line: link sent at, card updated at.

Once the new card is saved, whichever way it was collected:

1. The card becomes the default on the membership's Stripe subscription.
2. Any open unpaid invoice is charged immediately with the new card, no extra click.
3. The row's payment status refreshes in place: "Paid <date>" on success, or a new decline reason if the new card also fails.

The swimmer's enrollment status is never changed by any of this.

## Behavior details

- If the retry succeeds, the payment problem banner count drops by one on refresh.
- If there is no open invoice (for example the subscription is only marked past due), the card is still saved and set as default, and the dialog says Stripe will use the new card on its next retry.
- Rate limit: one card update link per membership per 15 minutes, matching the hold reminder pattern.
- Cancelled memberships with no live subscription show the reason instead of the fix actions.

## Technical notes

New edge functions (admin JWT verified in code, `verify_jwt = false`):

- `membership-card-update-link` — takes `membershipId`; resolves/creates the Stripe customer from `memberships.stripe_customer_id` or parent email; creates a `mode: "setup"` hosted Checkout Session (pattern copied from `admin-card-on-file-link`) with `metadata.membership_id`; sends SMS via the existing TextMagic helper and email via Resend; returns the URL for copy. Writes `card_link_sent_at`.
- `membership-card-setup-intent` — takes `membershipId`; returns a SetupIntent client secret for the in-person Stripe Elements form in the dialog.
- `membership-attach-card-and-retry` — takes `membershipId` and either `setup_intent_id` or `checkout_session_id`; reads the resulting PaymentMethod, attaches it to the customer, sets it as `invoice_settings.default_payment_method` on the customer and `default_payment_method` on the subscription, then finds the latest open/unpaid invoice for the subscription and calls `invoices.pay`. Returns paid / no_open_invoice / declined with the decline code. Updates the membership payment columns (`last_payment_status`, `last_payment_at`, `last_payment_amount_cents`, `payment_failure_reason`, `stripe_subscription_status`) and inserts a `membership_payment_events` row.

`payments-webhook` gains handling for `checkout.session.completed` in `setup` mode carrying `metadata.membership_id`, so the link path finishes the attach-and-retry even if the parent closes the tab; it calls the same shared helper as the function above (`_shared/membership-card.ts`).

Migration: add `card_link_sent_at timestamptz` and `card_updated_at timestamptz` to `memberships`. No other schema or RLS changes.

Frontend: new `src/components/admin/memberships/FixPaymentDialog.tsx` using `@stripe/react-stripe-js` Elements for the in-person path, wired into the existing rows in `MembershipsAdmin.tsx`. Environment comes from the existing `get-payments-env` path already used on `/join`.
