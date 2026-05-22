## Problem

Parent Vicky (`alejandrocorcam@gmail.com`) tried to self-enroll her first-time swimmer through `/swim-enrollment` three times on May 21 (20:37, 20:38, 20:50). Each attempt created a `pending_enrollments` row but **none** ever converted into a `swim_enrollments` row via the Stripe webhook. The admin had to manually enroll the family 3 minutes later (20:53), marking payment_method=`other`, payment_reference=`Stripe Invoice`. This pattern (pending rows pile up, webhook never fires) means the embedded Stripe checkout iframe is failing to complete payment — not that parents are abandoning.

## Root cause

All three server functions that mint embedded checkout sessions still pass:

```
ui_mode: "embedded"
```

But our shared Stripe client (`_shared/stripe.ts`) is pinned to API version **`2026-03-25.dahlia`**, and the Stripe knowledge contract for that version requires:

```
ui_mode: "embedded_page"
```

`"embedded"` is the older value. Under dahlia + `@stripe/stripe-js@9.2.0` + `@stripe/react-stripe-js@6.2.0` the returned client_secret no longer mounts reliably in `<EmbeddedCheckout/>` — the iframe errors silently, the parent never gets to submit a card, and the webhook never fires. This is the same family of bug we already fixed for the *hosted* link functions (which needed `ui_mode: "hosted"` to get a `session.url` back); this one is the embedded-mode counterpart.

This affects:
- **Public swim enrollment** (`create-checkout`) — new families paying $45 reg fee, returning families paying $240, first-timers electing pay-ahead $285 — all broken
- **Admin phone checkout** (`create-admin-phone-checkout`) — admin charging a card live over the phone
- **Lesson occurrence checkout** (`create-lesson-occurrence-checkout`) — admin charging in-person for a single private lesson

## Fix

### 1. `supabase/functions/create-checkout/index.ts`
- Change `ui_mode: "embedded"` → `ui_mode: "embedded_page"` on `stripe.checkout.sessions.create`.
- After creation, hard-guard `if (!session.client_secret)` → return 500 with explicit error (mirrors the URL guard we added to the hosted link functions). Prevents silent failures and surfaces problems immediately in edge logs.

### 2. `supabase/functions/create-admin-phone-checkout/index.ts`
- Same `ui_mode` swap + `client_secret` guard.

### 3. `supabase/functions/create-lesson-occurrence-checkout/index.ts`
- Same `ui_mode` swap + `client_secret` guard.

### 4. Verification
- Redeploy the three edge functions.
- Curl `create-checkout` with a real test payload against a session that has open capacity and confirm a `clientSecret` is returned.
- Load `/swim-enrollment` in the preview, walk through as a first-time family, and confirm the embedded card form renders and accepts the Stripe test card `4242 4242 4242 4242`.
- After the test charge, confirm a new `swim_enrollments` row is written by the webhook with `payment_status='paid'` and a Stripe `pi_...` reference.

## Out of scope

- The two hosted-link functions (`send-registration-fee-payment-link`, `send-session-payment-link`) are already fixed and working — not touching them.
- No DB schema, RLS, or UI changes. The React components (`EnrollmentCheckout`, `LessonOccurrenceCheckoutDialog`, `PhoneCheckoutPanel`) already consume `clientSecret`, so they need no edits.
- No change to webhook handling — once embedded mounts and the parent pays, the existing `checkout.session.completed` handler converts the pending row exactly as designed.
