## Two issues to fix

### 1. "Something went wrong, please contact the merchant" on Charge card now

The Stripe form never loads, which means Stripe rejects the Checkout Session as soon as the iframe boots. In embedded checkout that error is almost always an **account mismatch between the secret key that created the session and the publishable key that mounts the form**.

Relevant paths:
- Frontend: `PhoneCheckoutPanel` → `create-admin-phone-checkout` edge fn → `_shared/stripe.ts` → `createStripeClient(env)`
- `_shared/stripe.ts` currently prefers a manually-set `STRIPE_API_KEY` over the Lovable gateway keys. If `STRIPE_API_KEY` is `sk_test_…` while `VITE_PAYMENTS_CLIENT_TOKEN` is `pk_live_…` (or vice versa), every embedded checkout will fail with this exact error.

Plan:
1. Add structured logging to `create-admin-phone-checkout` around the `checkout.sessions.create` call: log which key path was used (manual vs gateway), the environment argument received, and Stripe's error message on failure. This gives us the smoking gun in the edge function logs.
2. Check `STRIPE_API_KEY` (via secrets tool) — confirm it matches the environment implied by `VITE_PAYMENTS_CLIENT_TOKEN` (live pk needs a live sk, sandbox pk needs a test sk). If mismatched, either delete the override so the gateway keys are used again, or replace with the correct key from the same Stripe account.
3. Reproduce the click, tail edge function logs, confirm the session is created successfully. If the session is created but the iframe still errors, the issue is publishable/secret account mismatch — resolved by step 2.
4. Sanity-check the other embedded checkouts (`LessonOccurrenceCheckoutDialog`, `PrivateCardSetup`) — they share the same client, so this fix restores all of them.

No frontend changes needed unless step 3 reveals a per-function config bug (e.g. `expires_at`, `ui_mode`).

### 2. Luca (and others) showing as no waiver on calendar enrollment card

Confirmed in DB: both of Luca Batista's `swim_enrollments` rows have `waiver_signed_at = 2026-06-08`. The calendar card at `CalendarBlockDetail.tsx:650` reads `enr.waiver_signed_at` directly from the enrollment row, so anyone with a signed waiver on a *different* enrollment row (e.g. new session added after the waiver was signed on a prior enrollment) will incorrectly show "Email waiver".

The project already has an RPC that handles this correctly: `get_active_waiver_signed_at_for_swimmer(_first, _last, _dob)` — it returns the most recent valid waiver for a swimmer across all enrollments and waivers.

Plan:
1. In `useCalendarData.ts`, also select `child_first_name, child_last_name, child_dob` on the enrollments query so the calendar has the identifiers it needs.
2. After the enrollments load, batch-resolve the active waiver per unique `(first, last, dob)` triple via the RPC and merge the resulting `waiver_signed_at` back onto each enrollment (keeping the row's own `waiver_signed_at` if the RPC returns nothing).
3. `CalendarBlockDetail.tsx` and any other consumer that keys off `enr.waiver_signed_at` (e.g. Email waiver button, the "Mark waiver complete" flow) then reflect the true swimmer-level state without any UI changes.
4. Verify by opening Luca's block — Email waiver button should disappear and the green waiver check should show.

### Order

Fix 1 first (blocking real-money charges). Fix 2 second (cosmetic/workflow annoyance).