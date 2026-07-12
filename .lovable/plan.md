## Goal

Add a one-click admin action that texts every enrolled family for a given session a reminder that lessons start tomorrow, including their class time and — if they still owe — a Stripe payment link to pay their session fee before arrival.

## Where the button lives

On the `SessionsAdmin` / `SwimEnrollmentsAdmin` session header (same place session filters/actions already live). Button label: **"Text tomorrow's start reminder"**. Confirms before firing so it isn't accidentally sent twice.

Also a per-session "Preview recipients" step in the confirm dialog: shows the count of enrollments that will be texted, how many include a pay link vs. reminder-only, and how many will be skipped (no phone / already sent today).

## New edge function: `send-session-start-reminders`

Server-side, service-role, mirrors the pattern in `send-group-lesson-sms-reminders` and `admin-send-todays-reminders`. Admin-gated (JWT + `has_role admin`).

Input: `{ sessionId, environment }`.

Steps:
1. Load `swim_sessions` row for `sessionId` (start_time, session_price, session_name).
2. Load active `swim_enrollments` for that session (id, child_name, parent_first_name, parent_phone, session_fee_status, session_fee_payment_link_url), excluding `cancelled`/`suspended`.
3. Dedupe against `reminder_logs` where `reminder_kind = 'session_start_reminder'` and `session_id = <sessionId>` already `sent` — so re-clicking is safe.
4. For each enrollment:
   - Normalize phone; if missing, log `failed / no_phone` and skip.
   - If `session_fee_status` is `unpaid`/`due_day_1` (i.e. not `paid` and not `comp`): call `get-or-create-session-payment-link` (existing, idempotent) to fetch the Stripe Payment Link. Include it in the SMS.
   - Compose message:
     - With pay link: `Hi {parentFirst}, {childFirst}'s first lesson at Aquatic Dreams is tomorrow at {time}. Pay the $${amount} session fee before you arrive: {link}. Reply STOP to opt out.`
     - Paid/comp: `Hi {parentFirst}, reminder: {childFirst}'s first lesson at Aquatic Dreams is tomorrow at {time}. See you at the pool!`
   - Send via existing TextMagic helper.
   - Log to `reminder_logs` with `reminder_kind = 'session_start_reminder'`, `session_id`, `enrollment_id`, `channel = 'sms'`, message body, status, error.
5. Return `{ ok, sent, skipped_paid, skipped_no_phone, failed, errors }`.

## Frontend wiring

- New small component `SessionStartReminderButton.tsx` that opens a confirm dialog with the preview counts, then calls `supabase.functions.invoke("send-session-start-reminders", { body: { sessionId, environment } })`, and toasts the result summary.
- Mount it on the session header in `SwimEnrollmentsAdmin.tsx` (next to existing bulk actions). No other UI moves.

## Data & guarantees

- Payment link is the same Stripe Payment Link used by the email/SMS single-send flows, so the existing `payments-webhook` handles `session_fee` completion — no new webhook work.
- Idempotent per enrollment via `reminder_logs` dedupe; safe to click twice.
- Respects existing rules: no send to cancelled/suspended, no pay link on paid/comp, no send without a phone.
- Nothing is scheduled automatically — this is a manual admin action only, per your admin-initiated billing rule.

## Files touched

New:
- `supabase/functions/send-session-start-reminders/index.ts`
- `src/components/admin/SessionStartReminderButton.tsx`

Edited:
- `supabase/config.toml` — register the new function.
- `src/pages/admin/SwimEnrollmentsAdmin.tsx` — mount the button on the session header.

## Out of scope

- No email version.
- No cron/auto-schedule. If you later want it to fire automatically at, say, 10am the day before each session starts, that's a small follow-up that reuses this function.
- No changes to the existing per-row "Text pay link" button.
