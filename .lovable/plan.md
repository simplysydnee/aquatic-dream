## Two issues, two fixes

### 1. Lesson reminder is missing session start/end dates

In the screenshot, the reminder shows the lesson date, time, level, session, and address — but no session period date range (e.g. "Session 1: June 8 – July 2"). The data exists in `swim_sessions.session_start_date` / `session_end_date` and the dispatcher just isn't pulling it through.

**Fix:**
- `supabase/functions/send-lesson-reminders/index.ts` — extend the `swim_sessions` select to include `session_start_date, session_end_date`, format them, and pass `sessionStartDate` + `sessionEndDate` into `templateData`.
- `supabase/functions/_shared/transactional-email-templates/lesson-reminder.tsx` — add two optional props and render a "📆 Session dates: June 8 – July 2, 2025" line inside the existing info box. Update `previewData` to include sample dates.
- Redeploy `send-lesson-reminders` and `send-transactional-email`.
- Send a fresh test reminder to **sydnee@icanswim209.com** so you can verify the new line appears.

The enrollment-confirmation email already has the date range wired correctly (`sessionStartDate` / `sessionEndDate` are passed by `payments-webhook` and rendered in the template) — no change needed there.

### 2. The "click here to pay" button — confirm it generates a real Stripe Checkout URL

Good news: the `send-session-payment-link` edge function **already** creates a real Stripe checkout session via `stripe.checkout.sessions.create({...})` with `lookup_keys: ['swim_session_fee']` and uses the returned `checkoutSession.url` as `paymentLink`. So in production it will be a real `https://checkout.stripe.com/c/pay/cs_test_...` (or `cs_live_...`) URL — not a placeholder.

The earlier `cs_test_demo123` URL you saw came from the manual curl test I sent with sample data — not from this function. To confirm the live wiring works:

**Verification:**
- Pick a real enrollment with `session_fee_status != 'paid'` (Sydnee's test enrollment).
- Invoke `send-session-payment-link` with `{ enrollmentId, environment: 'sandbox' }` — this will hit Stripe, generate a real sandbox checkout URL, and email it to the parent on file.
- Confirm the email arrives with a working "Pay Session Fee — $240" button that opens a live Stripe checkout page.

Two small hardening tweaks while we're in there:
- Switch the checkout from legacy `success_url`/`cancel_url` to embedded-mode-compatible `return_url` (or keep hosted but point success/cancel to a real return page like `/swim-enrollment/payment-complete`).
- Pass the real site origin (`https://aquaticdreamsswim.com`) instead of the hardcoded `aquatic-dream-quest.lovable.app` fallback when invoked from cron/admin.

### Not doing
- ❌ No DB migrations
- ❌ No change to enrollment-confirmation email (already correct)
- ❌ No change to the Stripe price / product setup

### After this lands
You'll need to click **Publish → Update** to push the updated edge functions live. Then I'll trigger one real `send-session-payment-link` call against your test enrollment so you can click through a real Stripe checkout.