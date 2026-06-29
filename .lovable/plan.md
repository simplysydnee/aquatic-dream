# Step 5 — Public Self-Serve Card Reuse + Booking Idempotency

Scope is strictly `lesson_bookings` / private-lesson self-serve checkout. No touch to `swim_enrollments` or any group-enrollment code.

## What ships

1. **New edge function `lookup-parent-card-on-file-public`** (public, rate-limited).
   - Input: `parent_email`, `parent_first_name`, `parent_last_name`, `environment`.
   - Requires email **plus** matching first+last on a non-cancelled prior `lesson_bookings` row (enumeration control #1).
   - Calls existing `findReusableCardForEmail` from `_shared/card-on-file.ts` — no logic fork.
   - Always returns `200` with either `{ found: false }` or `{ found: true, brand, last4, exp_month, exp_year, reuse_token }` (enumeration control #2 — uniform shape, no timing branch on "email exists").
   - `reuse_token` = short-lived (10 min) HMAC of `{booking_id_placeholder, email, pm_id}` stored in a new `card_reuse_tokens` table; never returns `payment_method_id` or `customer_id` to the browser (enumeration control #3).
   - In-memory + DB rate limit: max 5 lookups per email per 10 min, max 20 per IP per 10 min (enumeration control #4).

2. **`create-private-booking-setup` — additive branch only.**
   - New optional body field `reuse_token`.
   - If `reuse_token` is **absent or invalid or expired** → existing code path runs unchanged. Stripe Checkout setup session is created exactly as today.
   - If `reuse_token` is **present and valid** → resolve it server-side to `(customer_id, pm_id)`, re-validate via `findReusableCardForEmail` against the submitted email, and if still valid: stamp the booking with the PM, mark occurrences `card_on_file/scheduled`, skip Stripe Checkout, return `{ booking_id, reused: true }` (no `client_secret`).
   - Every step inside the reuse branch is wrapped in `try/catch`. **Any throw → log + fall through to the normal Setup Checkout path in the same request.** The parent never sees a reuse-related error.

3. **Idempotency fix (the "ghost bookings" root cause).**
   - Add optional `idempotency_key` (uuid, client-generated once per wizard mount) to `create-private-booking-setup`.
   - New unique index `lesson_bookings(idempotency_key) WHERE idempotency_key IS NOT NULL`.
   - On insert conflict: re-fetch the existing booking + its Checkout session and return the original `client_secret` instead of creating a parallel `pending_card` row. Resolves Freya/Valeria-style duplicates.

4. **Frontend (`PrivateBookingFlow.tsx` + `PrivateCardSetup.tsx`) — additive UI.**
   - On parent-info step blur of email+first+last, call the new lookup. On `found:true`, show a **non-blocking** banner above the existing Stripe Checkout iframe: "Use VISA •••• 8911 on file?" with **two buttons**: `Use this card` and `Enter a new card instead`.
   - "Enter a new card instead" is the default visual state; the existing Stripe Elements/Checkout flow is **always rendered and always usable**, exactly as today. The banner only adds an option; it never removes or gates anything (your requirement #3).
   - Behind feature flag `VITE_ENABLE_SELF_SERVE_CARD_REUSE` (default `"false"`). When off, the lookup is never called and the banner never renders.

## Answers to your 5 questions

### 1. Brand-new family with no prior bookings — flow byte-for-byte unchanged?

**Yes.** Walk-through:
- Feature flag off → frontend never calls the lookup, `reuse_token` is never sent, server takes today's exact path: validate → conflicts → blackouts → availability → Stripe customer → Checkout session → insert booking → insert occurrences → agreement → return `client_secret`. Zero diff.
- Feature flag on, but no prior booking → lookup returns `{found:false}` → frontend doesn't render the banner → `reuse_token` is never sent → server skips the reuse branch entirely (first line check: `if (!body.reuse_token) { /* today's flow */ }`) → identical code path.
- Idempotency key is new but **optional**; absent key = today's behavior (no unique-index hit possible).

### 2. Blast radius of a lookup/reuse error

The reuse branch is structured as:
```ts
if (body.reuse_token) {
  try {
    // resolve token, revalidate PM, stamp booking, return early
  } catch (e) {
    console.error("reuse branch failed, falling through", e);
    // do nothing — fall through to normal Setup Checkout flow below
  }
}
// ... existing unchanged code from line 1 onward executes
```
A throw anywhere in the reuse branch → fall-through to today's Setup Checkout. The parent gets the normal card-entry iframe. The only user-visible difference vs today is a logged warning server-side. The lookup endpoint is a separate function; if it 500s, the frontend swallows the error and simply doesn't show the banner.

### 3. Feature flag + staged rollout

**Yes — both safeguards layered:**
- `VITE_ENABLE_SELF_SERVE_CARD_REUSE` env flag, default `"false"`. Ships dark. We flip it on only after manual sandbox verification.
- Even with the flag **on**, the UI is purely **additive**: the existing "enter a new card" Stripe Checkout iframe is always rendered and always functional. The banner adds a one-click reuse button; it never replaces or hides the card-entry path. A parent who ignores the banner gets exactly today's experience.
- Server-side `reuse_token` handling is also additive: absent token = today's flow. We can leave the flag off for days, ship the code, and validate the lookup endpoint in isolation before turning UI on.

### 4. Verification plan before flipping live

In sandbox (Stripe test mode), with flag **off**:
- a. Brand-new email, no prior bookings → complete a full self-serve booking. Confirm `client_secret` returned, Checkout completes, `confirm-private-booking` flips to `active`, confirmation email + SMS sent. **This is the regression gate.**
- b. Repeat with an email that DOES have a prior booking → confirm no banner appears, no lookup call in network tab, flow identical to (a).

Then flip flag **on** in sandbox:
- c. Brand-new email → confirm `{found:false}`, no banner, flow identical to (a). **Second regression gate.**
- d. Email with prior booking but different first+last → confirm `{found:false}` (enumeration guard works), normal flow.
- e. Email + matching name with valid PM → banner appears, click "Use this card" → booking activates without Checkout, confirmation sent.
- f. Same as (e) but click "Enter a new card instead" → today's Checkout flow runs, no reuse.
- g. Force a thrown error in the reuse branch (temporary `throw` injection) → confirm fall-through to Checkout, parent sees no error.
- h. Double-submit the wizard (network retry) with same `idempotency_key` → confirm single booking row, no ghost duplicate.

Only after a–h pass in sandbox do we flip the flag in production, then re-run (a) and (e) as a real $0.50-style live smoke test before announcing.

### 5. Zero overlap with group enrollment (Session 2)

Confirmed. Files touched:
- `supabase/functions/lookup-parent-card-on-file-public/index.ts` (new)
- `supabase/functions/create-private-booking-setup/index.ts` (additive branch + idempotency key)
- `supabase/functions/_shared/card-on-file.ts` (unchanged — reused as-is)
- `src/components/private-lessons/PrivateBookingFlow.tsx`, `PrivateCardSetup.tsx`
- One migration: `card_reuse_tokens` table + partial unique index on `lesson_bookings.idempotency_key`

**Not touched:** `create-checkout`, `create-pending-enrollment`, `create-admin-phone-checkout`, `swim_enrollments`, `swim_sessions`, `session_periods*`, `SessionPicker.tsx`, `EnrollmentCheckout.tsx`, any `ReturningFamilyEntry` code path, any RLS/grants on session/enrollment tables. The group enrollment flow shares zero functions, zero tables, zero components with this change.

## Recommendation

Ship code with flag **OFF**. Validate (a)–(h) in sandbox. Then enable in production and smoke-test live. The idempotency fix is independently valuable (kills the ghost-booking class of bug) and is also gated by an optional client-supplied key, so it carries the same "absent = unchanged behavior" guarantee.
