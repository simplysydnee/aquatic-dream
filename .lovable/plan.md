# Close converted holds server-side, and make the payment-problem filter clearable

Two unrelated fixes. No schema change, no RLS change, no change to the capacity trigger or to how `get-open-slots` computes capacity.

## Problem 1: a family who finished enrollment still shows as pending

Confirmed: membership `aaffbfa8` (Armani Eshaq, Private, parent anapaulajimenez@gmail.com, slot `a8ec3b81`) is `active` with a live Stripe subscription and a waiver on file, while hold `70e89b96` for the same parent and slot is still `held` with no `converted_at`. That hold is what the Pending enrollments panel is showing.

Root cause: a hold is only closed by the browser. `JoinMembership.tsx` calls `get-membership-hold` with `action: "convert"` in two fire-and-forget places (saved-card path, and the `?membership=success` return effect), with no error check and no retry. Conversion is skipped when the parent closes the tab, when `confirm-membership-checkout` errors, when `session_id` is missing, or when the parent ignores the texted link and enrolls from /join directly. Nothing on the server ever closes a hold.

### 1a. Reconcile pass in the hold sweep

In `sweep-membership-holds`, before the expiry step, close any `held` hold that provably matches an existing membership. All five conditions required:

1. same `standing_slot_id`
2. same parent email, case-insensitive
3. swimmer name matches after normalizing (lowercase, collapse whitespace, strip punctuation) against `child_first_name || ' ' || child_last_name`
4. membership `created_at >= hold created_at`
5. membership status is not `cancelled`

Conditions 3 and 4 are not optional: adult-group families book several adults on one email into one slot. Hold `2daacf95` (Bhanuprett Kaurrh) matches a membership on email and slot alone, but that membership is a different swimmer created six days earlier.

Log every hold closed with hold id, membership id, and the matched rule. Never delete a row, never touch a membership. Return the reconcile count alongside `expired` and `reminded`.

### 1b. Close the hold at completion time

The hold token never reaches the server today; it is only smuggled into the `returnUrl`. The enrollment travels in `pending_memberships.payload`, so the token travels there too.

- `JoinMembership.tsx`: add `hold_token: holdToken || null` to `buildCheckoutBody()`. Existing `returnUrl` behavior unchanged.
- `create-membership-checkout`: read `hold_token` from the body, validate it is a reasonable-length string or null, include it in the staged payload. Never fail checkout when missing.
- `_shared/membership-completion.ts`: add `markHoldConverted(payload)` that flips a still-`held` hold matching `payload.hold_token` to `converted`. Idempotent, wrapped in try/catch so it can never throw into completion, called from all three success exits of `ensureMembershipRecord` (existing-subscription short-circuit, replay reconcile, fresh insert).

No email/slot fallback here; 1a covers that in one place with the stricter rule.

### 1c. Stop losing browser-side failures

Keep both convert calls as a fast path, but destructure `{ error }` and `console.error` on failure instead of discarding it. No toast, no blocking the success screen.

### 1d. Repair the one live row

Single data update setting hold `70e89b96` to `converted` with `converted_at` and a note referencing membership `aaffbfa8`, guarded on `status = 'held'`. No membership row touched.

## Problem 2: the payment-problem banner filter cannot be cleared

In `MembershipsAdmin.tsx`, "Show them" sets the payment filter to problems and flips on "Include cancelled and paused", with no way back.

- Make it a toggle: when the problem filter is off, it reads **Show them** and stashes the previous payment filter and include-inactive values before applying. When on, it reads **Show everyone** and restores both.
- Add a small "Clear filters" button in the filter row, shown only when search, program, status, day, payment, or include-inactive is off its default. It resets all six.

## Verification

1. Re-query Armani: membership still `active` with the same subscription id, hold now `converted`; panel no longer lists the family.
2. Run the reconcile match as a dry-run SELECT first and paste the result. It must return only Armani's hold and must not return `2daacf95`. If Bhanuprett's hold appears, fix the name or created_at condition before writing anything.
3. Confirm hold row count is 24 before and after, nothing deleted.
4. Confirm `get-open-slots` no longer counts the hold as an occupant on slot `a8ec3b81`.
5. On /admin/memberships: Show them, confirm it reads Show everyone, click again, confirm both filters return exactly where they were. Then set several filters and confirm Clear filters appears and resets all of them.
6. Walk `/join?hold=<token>` end to end on a test hold and confirm the hold lands `converted` even if the tab is closed right after the card is saved.
