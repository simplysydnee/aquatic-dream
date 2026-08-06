# Welcome page for returning session families

## What I found first (as asked)

- `JoinMembership.tsx` reads query params with plain `new URLSearchParams(window.location.search)` in three places: the `holdTokenFromUrl()` helper and the `holdToken` state initializer (both run before first paint, lines ~116 and ~289), and the post-checkout return effect that looks for `membership=success` (line ~943).
- There is **no `src` handling anywhere today**. The only "source" value sent to checkout is a hardcoded `source: "public"` in the membership payload (line 737). So `src=summer2026` is currently dropped entirely; it is not preserved to checkout for tracking. That gap has to be closed as part of this phase, or the tracking claim stays untrue.
- Cleanest intercept point: **the route level in `App.tsx`**, not inside `JoinMembership.tsx`. A tiny wrapper around the `/join` element checks the URL before `JoinMembership` mounts, so none of its hold/first-paint logic runs. That keeps every non-`summer2026` path byte-identical in behavior.

## What gets built

**1. New standalone page `/welcome-back`** (`src/pages/WelcomeBack.tsx`), outside `PublicLayout`, matching the standalone style of `/join`.

Content, exactly four points, plain language, no prices, no urgency:

- This is a Swimbership: a monthly membership, not a one-time session payment like before.
- It renews automatically each month until you cancel. Cancel anytime with 30 days notice.
- Your spot is yours every week. No re-signing up each session.
- If you already have a waiver on file, it carries over. Nothing to redo.

Above them, a short thank-you for swimming with us this summer and one line saying what changed. Below them, one button: **Choose your program**, going to `/join?src=summer2026`.

**2. Redirect gate.** A small `JoinEntry` wrapper on the `/join` route:

```text
/join?src=summer2026 + not seen this session  ->  redirect to /welcome-back?src=summer2026
anything else                                  ->  render JoinMembership unchanged
```

The gate runs synchronously before `JoinMembership` renders, so the picker never flashes. It only fires when `src` is exactly `summer2026`. A `hold` param present alongside it skips the welcome page (phone hold links stay untouched).

**3. Session-only suppression.** `sessionStorage` key `welcomeBackSeen`, set when the welcome page renders. Back button, refresh, or re-tapping the SMS in the same tab session goes straight to `/join`. Nothing persists across browser sessions.

**4. `src` preservation through checkout.** `JoinMembership` reads `src` off the URL once and:
- keeps it on the Stripe `returnUrl` so the success return still carries it,
- sends it as the membership `source` value instead of the hardcoded `"public"` (falls back to `"public"` when absent).

This is the only change to existing join behavior, and it is inert for any visit without `src`.

## Not touched

Pricing, program picker, slot picker, consent, waiver skip logic, hold flow, checkout logic beyond the single `source` value. No countdown, scarcity, or dollar amounts on the welcome page.

## Verification

- Fresh session, `/join?src=summer2026` -> welcome page, no picker.
- Click through -> `/join?src=summer2026`, and `src` reaches the checkout payload and return URL.
- `/join` bare and `/join?hold=<token>` -> unchanged, verified against a live hold link.
- Reload / back in the same session -> straight to `/join`, welcome page not repeated.
- Grep the welcome page for `$` and any digit-amount pattern: none.
