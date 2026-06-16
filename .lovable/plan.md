## Debug & fix "Send today's reminders" stuck grey

### Root cause
`handleSendTodaysReminders` in `src/pages/admin/CalendarAdmin.tsx` writes `localStorage["reminders-sent-<today>"] = "1"` on every successful invoke — even when the function returned `sent: 0` or all failed. Once set, the button stays disabled forever for the day with label "Reminders sent". That's why it looks like nothing happened.

There may also be a real send-side issue (0 occurrences matched, TextMagic creds missing, or query filter wrong). We need to surface that instead of silently locking the button.

### Fix (UI only first, then verify backend)

1. **`src/pages/admin/CalendarAdmin.tsx`**
   - Only set the `localStorage` "sent" flag when `sent > 0` AND `failed === 0`.
   - When `sent === 0 && failed === 0`, show an info toast: "No reminders to send" and leave the button enabled.
   - On error or partial failure, leave button enabled so admin can retry.
   - Show the returned `date` and counts in the toast for visibility.

2. **Clear stale flag immediately** so the user can retry today: instruct the cleared key via a one-time `useEffect` that removes any `reminders-sent-*` keys older than today is already handled; for today's stuck key, the UI fix above re-evaluates on next click only — so we also remove today's key on mount if no successful send is recorded server-side. Simplest: drop the localStorage gating entirely and rely on the edge function's own dedup (it already filters out occurrences already in `reminder_logs` with `status='sent'` for today). Re-clicking is then safe and idempotent.
   - Action: **remove** the `remindersSentToday` localStorage state and just use `sendingReminders` for the disabled state. Server-side dedup handles double-clicks.

3. **Verify backend after UI fix** (debug, no code change unless needed):
   - Query `reminder_logs` for today to see if any rows were written.
   - Query `lesson_booking_occurrences` for today with `status='scheduled'` to confirm there are candidates.
   - Check `admin-send-todays-reminders` edge function logs for the last invocation.
   - Confirm `TEXTMAGIC_USERNAME` and `TEXTMAGIC_API_KEY` secrets exist.
   - If function returned `sent: 0` because no rows matched, no further code change needed.
   - If TextMagic creds missing → ask user to add them.
   - If query needs adjustment (e.g. timezone boundary on `occurrence_date`) → patch the edge function.

### Files touched
- `src/pages/admin/CalendarAdmin.tsx` — remove localStorage gating, improve toast feedback.
- Possibly `supabase/functions/admin-send-todays-reminders/index.ts` if backend debug reveals an issue.
