## Overhaul transactional emails: accurate amounts, full session details, real dates, and a working pay button

The three transactional emails (enrollment confirmation, lesson reminder, session payment link) all have fixable problems. Here's what I'll change.

---

### 1. Enrollment confirmation — show the exact Stripe-paid amount + full session details

**Current problems**
- For first-time families, the email shows a hardcoded `$45` registration fee instead of what Stripe actually charged on that row.
- The session block ("📋 Session 1 — Mon 3:00 PM") is short and doesn't include start/end dates, end time, or swimmer name in a clear summary.
- Swimmer name appears in body text but no consolidated "Enrollment summary" block.

**Fix**
- In `payments-webhook/index.ts → sendEnrollmentConfirmation`, source the registration-fee amount from `enrollment.payment_amount` (what Stripe actually charged on that row, already validated against `session.amount_total` in step 5 of the webhook) instead of `enrollment.registration_fee`. For returning families, keep using `payment_amount` as `totalPaid`. Also pass `paymentReference` = `enrollment.stripe_payment_id` (the Stripe Checkout Session ID — that's the verified Stripe receipt identifier).
- Fetch `session.session_start_date`, `session.session_end_date`, `session.end_time` from `swim_sessions` and pass a structured `enrollmentSummary` to the template:
  - Swimmer name
  - Level label
  - Day of week + start time–end time
  - Session start date → end date
- Update `enrollment-confirmation.tsx` to render a clean **Enrollment Summary** info-box at the top with all of the above, and show the Stripe Session ID as a small "Payment confirmation: `cs_xxx…`" line under the amount-paid block.

---

### 2. Lesson reminder — use the actual date and time, not "tomorrow"

**Current problems**
- Subject is `"Lesson Tomorrow for {childName}"` — keep "tomorrow" as friendly framing in the subject is fine, BUT the body opens with "has a swim lesson **tomorrow**!" with no date/time on the same line, then shows date/time in a separate box.

**Fix**
- In `lesson-reminder.tsx`, change the lead sentence to:
  > "{childName} has a swim lesson on **{lessonDate} at {lessonTime}**."
- Drop the standalone "tomorrow" word from the body (keep it only in the subject for urgency).
- Keep the info box (date, time, level, location) for at-a-glance scanning.
- `send-lesson-reminders/index.ts` already passes `lessonDate` (e.g. "Monday, June 9") and `lessonTime` (e.g. "3:00 PM") — no edge-function change needed.

---

### 3. Session payment link — fix the copy and make the button work

**Current problems**
- Subject says "Session Fee Payment Due" with no due-date context.
- Body says "starting on {dueDate}" which is vague; user wants explicit "**payment due on the first day of lessons, {date}**".
- The button label is fine, but the surrounding copy doesn't say "Click here to complete payment."
- The `paymentLink` is built using Stripe's redirect-mode `success_url` / `cancel_url` — this works (it returns a hosted Stripe checkout URL), so the button DOES function. I'll verify by sending a test and clicking it. (Note: the rest of the app uses embedded checkout per project knowledge, but for an email-link flow a hosted Stripe page is the correct pattern.)

**Fix**
- Update `session-payment-link.tsx` body copy to:
  > "{childName}'s session fee of **{amountDue}** is due on the **first day of lessons — {dueDate}**."
  > "Click the button below to complete your payment securely:"
  > **[ Pay Session Fee — $240 ]**
- Add a fallback plain-text link under the button ("Or copy this link: {paymentLink}") in case the button doesn't render in some clients.
- Subject becomes: `"Session Fee Due {dueDate} for {childName} — Aquatic Dreams"`.
- No edge-function change needed — `send-session-payment-link/index.ts` already passes `dueDate`, `amountDue`, and `paymentLink`.

---

### Verification plan

After the edits, I'll send fresh test emails to **sydnee@icanswim209.com** for all three templates using realistic data (real enrollment ID for the payment-link test so the Stripe link is clickable). I'll also generate a hosted-checkout link via `send-session-payment-link` against a real recent enrollment row so you can click through and confirm Stripe accepts it.

### Files to change
- `supabase/functions/payments-webhook/index.ts` — fetch end_date/end_time, pass real `payment_amount` + Stripe session ID, build structured summary
- `supabase/functions/_shared/transactional-email-templates/enrollment-confirmation.tsx` — render summary block + Stripe receipt ID
- `supabase/functions/_shared/transactional-email-templates/lesson-reminder.tsx` — date/time in lead sentence, drop standalone "tomorrow"
- `supabase/functions/_shared/transactional-email-templates/session-payment-link.tsx` — clearer due-date copy, "click here" framing, fallback link

### Not doing
- ❌ No DB schema changes
- ❌ No change to the public enrollment flow / DOB picker / Stripe checkout creation
- ❌ Not switching session-payment-link to embedded checkout — hosted Stripe checkout from an email link is the right UX
