## What's actually happening

### 1. The May 6 payment for Holden Hamby IS in Stripe

Cross-checking your portal against the Stripe screenshot you sent:

| Portal occurrence | Stripe row |
|---|---|
| Holden Hamby — May 6 — **Paid** — `pi_3TTipG2HpbBBx5ls0lv7Oh6I` — `burkettsgold@yahoo.com` — $40 | Top row — Succeeded — `pi_3TTipG2HpbBBx5ls0lv7Oh6I` — `burkettsgold@yahoo.com` — $40, May 5 6:15 |

So the portal isn't lying — that payment is sitting in Stripe under the **Link** payment method (the green Link icon, not a card). It just looks different from the May 1 row that paid via Apple Pay/Visa, which is probably why it didn't jump out.

We can make this easier by showing a **"View in Stripe"** link on every paid occurrence in `CalendarBlockDetail.tsx`. The `stripe_session_id` (which actually stores the PaymentIntent id `pi_…`) is already on the row, so we just render it as `https://dashboard.stripe.com/payments/{pi_id}`.

### 2. The "12:00 AM" reminder time is wrong

Two separate things going on:

- **The reminder cron runs every hour on the hour** (`0 * * * *`) and the first tick of the day in Pacific is `07:00 UTC = 12:00 AM PT`. Because the only condition is "lesson is tomorrow PT and no link sent yet", the very first tick after midnight PT always wins — so every link goes out at midnight local.
- The portal then renders that `payment_link_sent_at` literally ("Link sent May 5, 12:00 AM"), which is technically correct but obviously a bad time to be emailing parents.

**Fix:** change the cron job `lesson-occurrence-reminders` to fire once a day at a sensible Pacific hour. **9:00 AM PT = 17:00 UTC**, so:

```
schedule: '0 17 * * *'
```

(Front desk usually wants morning-of-the-day-before reminders, but 9 AM PT the day before still gives the parent ~24 hrs notice and matches the existing "lesson is tomorrow" logic.)

If you'd rather fire at a different hour (e.g. 8 AM PT = 16 UTC, or 10 AM PT = 18 UTC), say so and I'll use that instead.

## Plan

1. **Reschedule reminders to 9 AM Pacific.** Update the `lesson-occurrence-reminders` pg_cron job from `0 * * * *` to `0 17 * * *` via a migration that drops + recreates the schedule. No edge-function code change needed — the existing function logic still works, it's just the trigger cadence.

2. **Add a "View in Stripe" link on paid lesson occurrences.** In `src/components/admin/calendar/CalendarBlockDetail.tsx`, when `lessonOcc.payment_status === "paid"` and `lessonOcc.stripe_session_id` starts with `pi_` or `cs_`, render a small link below the price row pointing to the right Stripe dashboard URL (`/payments/{pi_id}` for PaymentIntents, `/checkout/sessions/{cs_id}` for Checkout sessions). This makes payments instantly verifiable from the calendar.

3. **(Already correct, no change needed)** The portal status for May 6 is accurate — Stripe did receive the $40 via Link. Once step 2 lands you'll be able to click straight through to confirm.
