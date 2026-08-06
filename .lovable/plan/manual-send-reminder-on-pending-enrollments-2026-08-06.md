# Manual "Send reminder" on Pending Enrollments

## First: how reminder_sent_at is used today

`sweep-membership-holds` (runs every 15 min) owns `reminder_sent_at` entirely:

- It expires holds past `held_until`, then selects holds where `status = 'held'`, `reminder_sent_at IS NULL`, `created_at <= now - 24h`, and `held_until > now`.
- For each, it stamps `reminder_sent_at` **before** sending, so a failed send never earns a second attempt. That stamp is the one-per-hold latch.
- `MembershipHoldsPanel.tsx` only reads it, rendering the "Reminder" column as `Not yet` or a formatted time.

So a manual resend must never write `reminder_sent_at`. Writing it would silently cancel the pending automatic 24h reminder. A separate column keeps both meanings intact, and the sweep's query is untouched.

Also noted: the sweep composes its own shorter "still held for about N more hrs" copy, while `create-membership-hold` composes the invite copy (`we're holding a <program> spot for <first>, <Day Time>. Finish enrollment within <window>: <link>`). The manual reminder reuses the invite-style composition, with the group link when the hold has a `group_token`.

## 1. Database

One migration: add `last_manual_reminder_at timestamptz` (nullable) to `membership_holds`. Nothing else changes.

## 2. New edge function: `send-membership-hold-reminder`

Admin-gated with the same `has_role` check the sibling functions use.

Input: `{ hold_id: string }`.

Flow:
1. Load the hold with its standing slot (`plan_key`, `day_of_week`, `start_time`).
2. Reject with 400 if status is not `held`, or if `held_until` is already past.
3. Rate limit: if `last_manual_reminder_at` is within 30 minutes, return 429 with `{ error: "A reminder already went out <N> min ago. Try again in <M> min." }` — clear, never silent.
4. Compose the message with the same builder shape as `create-membership-hold`: program label, `Day Time` in Pacific, and the link (`group_token` if present, else `token`). Duration phrase derives from the remaining time on `held_until` via the existing `formatHoldWindow`, so the copy never claims a longer window than the hold has.
5. Send once through `sendAndLogBookingConfirmation` with `reminder_kind: "membership_hold_manual_reminder"` so manual sends are distinguishable in `reminder_logs`.
6. On success stamp `last_manual_reminder_at`; on failure stamp nothing and return 502 with the provider error.

No `held_until` extension. No touch of `reminder_sent_at` or `sms_sent_at`.

## 3. Panel UI (`MembershipHoldsPanel.tsx`)

- Select `last_manual_reminder_at` in the existing query.
- Reminder column shows both lines, unmerged: the automatic state as today (`Not yet` / `Aug 5, 3:12 PM`) and, when set, a second muted line `Manually resent Aug 5, 4:40 PM`.
- New "Send reminder" button in the row's action cell, rendered only when the row is live (`status === 'held'` and `held_until` in the future) — the same `live` flag already used to gate the cancel button. Expired, cancelled, and converted rows show nothing.
- Clicking opens a confirm dialog: "Text <swimmer>'s family again?" with the message context, then invokes the function. Success toast on send, error toast carrying the server message (including the rate-limit text) on failure. Row reloads after.
- No client-side cap on clicks; the 30-minute limit is enforced server-side.

## Technical notes

- New file `supabase/functions/send-membership-hold-reminder/index.ts`; deployed after edit. JWT validated in code like its siblings.
- `MembershipHoldsPanel.tsx` gains the button, an `AlertDialog`, and a per-row sending state.
- Sweep function and `create-membership-hold` / `send-membership-hold-invites` are not modified.

## Verification

1. Send reminder on a held row: one SMS, one `reminder_logs` row with kind `membership_hold_manual_reminder`, `last_manual_reminder_at` stamped, `held_until` unchanged.
2. Immediate second click returns 429 and surfaces "already sent recently" in a toast.
3. A hold with `reminder_sent_at IS NULL` past 24h still gets picked up by the sweep after a manual send.
4. A row with both stamps shows the automatic time and the "Manually resent" line separately.
5. Expired / cancelled / converted rows render no button.
