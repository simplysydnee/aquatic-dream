## Problem 1 — Tablet: tapping the client name in a calendar block does nothing

**Root cause (suspected, two compounding issues):**

1. `SwimmerLink` opens `SwimmerDetailDrawer` (a Radix `Sheet`) from inside `CalendarBlockDetail` (also a `Sheet`). On touch devices, Radix Dialog/Sheet primitives intercept the first `pointerdown` on a nested overlay-trigger and route it to the parent Sheet's outside-click handler, swallowing the tap. Mouse + click works because the synthesized `click` fires after the parent has already processed.
2. `SwimmerModalProvider.open()` does a synchronous `swimmers.find(...)`. If `useSwimmers()` hasn't finished loading yet (slower on tablets / cold cache), `setSelected(null)` is called and the drawer opens empty / appears to do nothing. There is no fallback fetch by `(child_name, parent_email)`.

**Fix:**

- In `SwimmerLink`, change the handler from `onClick` to `onPointerDown` (with `e.preventDefault()` + `e.stopPropagation()`) so the tap is captured before the parent Sheet's outside-pointer handler fires. Keep `onClick` as a keyboard/mouse fallback. This is the standard Radix-nested-overlay workaround.
- In `SwimmerModalProvider.open()`, if `swimmers.find(...)` returns nothing, fall back to a direct Supabase query (look up the swimmer by `child_name` + `parent_email` from the swimmers source) and only open the drawer once we have a result — otherwise show a toast ("Swimmer record not found") instead of an empty drawer.
- Verify on the iPad-sized preview viewport (820×1180) by tapping a private-lesson block → tapping the swimmer name.

## Problem 2 — "Add event" / "Send email" buttons feel very slow, but we must not show false success

Today's flow for booking a lesson with `sendPaymentLink = true` is fully sequential on the client and inside the edge function:

```
client → insert booking → insert pool_events → insert occurrences
       → invoke send-lesson-booking-confirmation
              → Stripe checkout.sessions.create   (~700–1500 ms cold)
              → 3 supabase selects (booking, count, firstOcc)
              → update occurrence row
              → invoke send-transactional-email   (cold start + Resend)
       → toast success
```

Total: 3–8 s on first invocation. Same shape for `send-lesson-series-confirmation` and the "Email payment due" / "Send Payment Link" buttons.

**Fix — speed up safely, no false success:**

1. **Return success only after the source-of-truth work is durable, not after the email send.** The actual booking + payment link is the user's deliverable; the email is a notification. Restructure `send-lesson-booking-confirmation` (and `send-lesson-series-confirmation`, `send-session-payment-link`) so they:
   - Create the Stripe checkout session.
   - Persist `stripe_checkout_url` + `payment_link_sent_at` on the occurrence.
   - Kick off `send-transactional-email` via `EdgeRuntime.waitUntil(...)` (background) and return `{ success: true, paymentLink, emailQueued: true }` immediately.
   - The background task writes to `email_logs` (already exists) on failure so admins still see real failures, and we add a `payment_link_email_status` column ("queued" / "sent" / "failed" + `payment_link_email_error`) on `lesson_booking_occurrences` so the UI can surface a real failure on next refresh instead of pretending it worked forever.
2. **Inside the edge function, parallelize the independent DB reads.** `count(occurrences)`, `firstOcc lookup`, and `booking` fetch can run in parallel via `Promise.all`. Saves ~300–600 ms per call.
3. **Client-side: optimistic UI + verified status.**
   - In `AddPoolEventDialog.handleLessonBookingSave`, after the booking + occurrences insert succeeds, close the dialog and toast "Lesson booked — sending confirmation…" right away. Then await the edge function in the background; if it returns an error, fire a second toast (`destructive`) "Confirmation email failed — resend from the calendar block" and the calendar already shows the booking.
   - Same pattern for "Send Payment Link" / "Email payment due" buttons in `CalendarBlockDetail`: button shows "Sending…" only until the Stripe link is created (fast), then resolves; the email itself is backgrounded and the row's `payment_link_email_status` updates the badge once the webhook/queue worker writes back.
4. **Cache the Stripe client between invocations.** `createStripeClient` is called per request; hoist the client to module scope keyed by env so warm invocations skip TLS handshake setup.
5. **Keep the existing reminder cron / `email_logs` table as the safety net** so backgrounded sends are still observable. No change to the webhook flow that confirms real payment.

## Files to change

- `src/components/admin/swimmer/SwimmerLink.tsx` — switch to `onPointerDown` + click fallback.
- `src/components/admin/swimmer/SwimmerModalProvider.tsx` — DB fallback lookup; guard against empty drawer.
- `src/components/admin/calendar/AddPoolEventDialog.tsx` — close dialog + toast immediately after DB inserts; background the email invoke.
- `src/components/admin/calendar/CalendarBlockDetail.tsx` — same pattern for "Send Payment Link" / "Resend".
- `supabase/functions/send-lesson-booking-confirmation/index.ts` — `Promise.all` reads; `EdgeRuntime.waitUntil` for email; return early.
- `supabase/functions/send-lesson-series-confirmation/index.ts` — same restructure.
- `supabase/functions/send-session-payment-link/index.ts` — same restructure.
- `supabase/functions/_shared/stripe.ts` — module-level client cache per env.
- New migration: add `payment_link_email_status text`, `payment_link_email_error text` to `lesson_booking_occurrences` (nullable, default null) so failures are visible.

## What we explicitly will NOT do

- Will not mark anything `paid` until the Stripe webhook fires (unchanged).
- Will not skip the email — only move it to a background promise that still logs failures.
- Will not change the per-lesson pricing, refund, or webhook logic.
- Will not touch `src/integrations/supabase/client.ts` or `types.ts`.

## Verification

- iPad viewport (820×1180): open a private-lesson block → tap swimmer name → SwimmerDetailDrawer opens.
- Create a new private lesson with "send payment link" on: dialog should close in <1 s after pressing Save; a follow-up toast confirms email status; edge function logs show the email path completing in the background.
- Hit "Send Payment Link" on an unpaid enrollment: button resolves in <1 s; if the email later fails, the row shows a "email failed" indicator after refresh instead of a false success.
