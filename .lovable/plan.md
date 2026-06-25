## Why this plan (not a direct fix)

I audited both edge functions, the client checkout component, and the database. **There is no code path in `create-checkout`, `create-pending-enrollment`, or the client checkout that behaves differently for a parent who has prior `swim_enrollments` rows.**

- Neither edge function queries `swim_enrollments` by parent email or runs a duplicate/"already enrolled" guard.
- `isFirstTime` is taken straight from the radio button on the form ("Yes, first time" / "No, returning swimmer"), not derived from the database.
- `create-checkout` does not resolve or create a Stripe Customer; it just passes `customer_email` to the embedded session. No "existing customer" branch can fail.
- Returning swimmers are charged the full `session_price` per row — no $0 returning-fee lookup exists server-side.
- Session 2 data is healthy: period `b2222222…` (2026-07-13 → 2026-08-05) is active; every session has 8 remaining lessons, capacity 3, zero confirmed enrollments. None of the 409 branches (`is full`, `no remaining classes`) would trigger.
- Edge-function logs show **zero** invocations of `create-checkout` or `create-pending-enrollment` in the recent window, and `pending_enrollments` / `swim_enrollments` have no rows in the last 6–12 hours. So the failing attempt either never reached the server, hit a different function, or happened outside the log window with no captured error text.

Shipping a "fix" now without the actual error message risks breaking the working path. The fastest route to a real root cause is to capture the exact failure on the next attempt.

## What this plan does

Add lightweight instrumentation and a visible client-side error surface so the next time any parent hits the bug, we get the literal failure message, the function name, the HTTP status, and the parent/session context. No behavior changes on the happy path.

### 1. Surface the real error in the checkout UI

File: `src/components/swim-enrollment/EnrollmentCheckout.tsx`

- In `fetchClientSecret`, when `error || !data?.clientSecret`, also `console.error("[checkout] fetchClientSecret failed", { message, status: (error as any)?.context?.status, data })` and render the message inline in a red alert above the embedded checkout so it isn't swallowed by Stripe's iframe generic "merchant" message.
- Same treatment for the fallback `handleReserve` path (logs `[checkout] reserve failed`).
- Keep the existing "session full → onSessionFull" branch unchanged.

### 2. Structured logging in both edge functions

Files: `supabase/functions/create-checkout/index.ts`, `supabase/functions/create-pending-enrollment/index.ts`

At the top of the `try` block, after `await req.json()`, add one `console.log("[create-checkout] start", { parentEmail, children: [{ childName, isFirstTime, sessionIds }], environment })` (and the analogous line in `create-pending-enrollment`). At each early-return error branch — capacity, sessions-not-found, no-remaining-classes, session-fee-mismatch, pending-insert-failure, stripe-no-client-secret — include the same context so a single log row root-causes the failure. No new branches, no behavior changes.

### 3. Wider log query after next failed attempt

Once the parent retries, query `function_edge_logs` filtered to these two function IDs with `status_code >= 400` over the prior 2 hours, plus the matching `postgres_logs` window, to retrieve the exact error and stack.

### 4. Optional Playwright reproduction (only if step 1–3 do not surface the error)

If a parent reports the bug again after instrumentation ships and we still see no server log, drive `/swim-enrollment` end-to-end in Playwright against a Session 2 Yellow class with "No, returning swimmer" selected, capturing screenshots at every step plus the Network panel for the `create-checkout` call.

## Out of scope

- No edits to Stripe customer logic, returning-fee logic, or any enrollment guard — the audit shows none exist on the server today.
- No schema changes, no RLS changes, no webhook changes.

## Deliverable after approval

Three small edits (one frontend file, two edge functions) plus the exact log query I'll run as soon as the next failed attempt comes in.
