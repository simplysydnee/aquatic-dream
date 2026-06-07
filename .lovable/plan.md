## Problem
Parents hit **"Could not save booking — Edge Function returned a non-2xx status code"** on the private-lesson legal step. The browser toast hides the real reason because `supabase.functions.invoke()` swallows the server's response body when the status is 4xx/5xx — it only surfaces the generic FunctionsHttpError message. The edge-function logs we can pull right now are empty (only fresh boot lines), so we don't yet know whether it's a Stripe call, a DB insert, or validation.

## Plan
Two-part fix: stop hiding the real error, then re-check after the next attempt.

### 1. Surface the real server error in `PrivateBookingFlow.tsx`
When `functions.invoke` errors, read the response body off `error.context` (a `Response` object) and parse `{ error }` out of it. Pass that through to the toast so parents/owner see the actual reason ("slots_taken", a Stripe message, a validation field, etc.) instead of the generic non-2xx string. Fall back to the generic message if parsing fails.

```ts
const { data, error } = await supabase.functions.invoke("create-private-booking-setup", { body: ... });
if (error) {
  let serverMsg = error.message;
  try {
    const body = await (error as any).context?.json?.();
    if (body?.error) serverMsg = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
  } catch { /* ignore */ }
  throw new Error(serverMsg);
}
```

### 2. Improve edge-function diagnostics in `create-private-booking-setup/index.ts`
- In the top-level `catch`, log `err?.message`, `err?.stack`, and `err?.code` (Stripe errors carry a `code`/`type`). Today it only logs the raw error which can render as `[object Object]` in the dashboard.
- Log a one-line breadcrumb before each external call (slot conflict check, Stripe customer lookup, Stripe checkout session create, DB inserts) so the failing step is obvious in logs.
- Return the breadcrumb tag inside the error body (e.g. `{ error: msg, step: "stripe_checkout" }`) so the surfaced toast tells us where it failed without needing a log dive.

### 3. Defensive fix already worth doing
- **DB inserts in the right order**: today we insert `lesson_bookings`, then `lesson_booking_occurrences`, then `enrollment_agreements`, then create the Stripe Checkout session. If Stripe fails, we leave an orphan `pending_card` booking + occurrences in the DB. Move the Stripe Checkout session creation **before** the DB inserts, or wrap the DB inserts so we roll back the booking row when Stripe fails. This prevents the secondary "slots_taken" bug that would appear once orphan rows accumulate.

### 4. After the next failed attempt
Once (1) ships, the parent toast (and our own retry) will quote the real error. We then patch the actual root cause and remove the temporary breadcrumb field if it's noisy.

## Out of scope
- No DB schema changes.
- No change to the public-facing copy other than the error message.
- No change to the group-enrollment flow.

## Files
- `src/components/private-lessons/PrivateBookingFlow.tsx` — parse server error body.
- `supabase/functions/create-private-booking-setup/index.ts` — breadcrumbs, richer error logging, reorder Stripe-before-DB (or rollback on Stripe failure).
