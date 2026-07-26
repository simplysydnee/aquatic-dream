## Goal

Every morning, email a report of yesterday's private and semi-private lessons showing whether each one was actually paid, verified directly against Stripe, with links into Stripe for each payment. Any lesson not billed is flagged at the top. Runs until the monthly membership switch on Aug 17.

## What the email contains

Subject: `Lesson billing audit — Sat, Jul 25 — 2 unbilled ($100)`

Sections:
1. **Needs attention** (first, only if any) — one row per unpaid/failed lesson: swimmer, parent name + phone, lesson type, time, instructor, amount owed, reason (no card on file / charge failed with Stripe's error / never charged / payment link sent but never completed).
2. **Paid** — swimmer, amount, how it was paid (card on file charge, payment link, cash/check/comp), and a `Stripe ↗` link to the exact PaymentIntent or Checkout Session, matching the style in your screenshot (method + reference id + link).
3. **Cancelled / no-charge** — cancelled or comped lessons, listed so nothing looks silently missing.
4. Totals footer: lessons, collected, outstanding.

## How payment is verified

For each occurrence dated yesterday (excluding abandoned bookings):
- If `stripe_payment_intent_id` exists, retrieve it from Stripe and trust Stripe's status, not the database. Report a mismatch explicitly (e.g. "DB says paid, Stripe says requires_payment_method").
- If `stripe_session_id` exists, retrieve the Checkout Session and check `payment_status`.
- If neither exists and payment_method is cash/check/comp, treat as paid offline (no Stripe lookup).
- If neither exists and no offline method, flag as **never billed**.

No writes to the database and no charging. This is report-only, as asked.

Stripe links use `https://dashboard.stripe.com/payments/{pi_id}` (or `/checkout/sessions/{cs_id}`), same pattern as the enrollment card in your screenshot.

## Technical details

- New edge function `send-lesson-billing-audit`, using `createStripeClient("live")` from `_shared/stripe.ts` and pricing from `_shared/private-lesson-pricing.ts` so the $50 Summer Special is reflected in amounts owed.
- Query `lesson_booking_occurrences` joined to `lesson_bookings` where `occurrence_date = yesterday (America/Los_Angeles)` and lesson type is private or semi-private, filtered through the existing `isRealLessonOccurrence` rules so abandoned carts never appear.
- New React Email template `lesson-billing-audit.tsx` registered in `transactional-email-templates/registry.ts`, sent via the existing `send-transactional-email` function, one send per recipient, with an idempotency key of `lesson-billing-audit-{date}-{recipient}` so a retry never double-sends.
- Recipients: `sutton@aquaticdreams.com` and `sydnee@icanswim209.com`.
- Scheduled with pg_cron at 7:00 AM Pacific daily. If yesterday had zero private/semi-private lessons, no email is sent.
- Supports a manual `{ date: "2026-07-25" }` body override so you can re-run any past day on demand, plus `dry_run: true` to return the JSON report without emailing.

## Not included

Group session enrollments, any auto-charging, and any database reconciliation — the report only tells you what to act on.
