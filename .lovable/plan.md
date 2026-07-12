## What's happening

On `/admin/enrollments`, opening "Preview start reminders" throws:

```
TypeError: resp.rows is not iterable
  at loadPreview (StartReminderPreviewDialog.tsx:69)
```

The summary counts render (29 pay link, 20 reminder only, 7 no phone), but the table shows "No enrollments match" because `resp.rows` came back missing/non-array, which also blows up the `for (const r of resp.rows)` loop that seeds the row checkboxes.

Root cause: the preview edge function generates a Stripe Payment Link for every "pay link" enrollment **sequentially** (29 serial calls to `get-or-create-session-payment-link`, each spawning its own function invocation + Stripe round-trip). That easily exceeds the edge function response window, so the client sees a truncated / malformed response — enough counts to render badges, no usable `rows` array.

## Fix

Two small, targeted changes. No schema, no Stripe flow changes, no new features.

### 1. `supabase/functions/send-session-start-reminders/index.ts`

- Replace the sequential `for` loop that awaits `fetchPayLink` per enrollment with a single `Promise.all` over just the rows that actually need a pay link (variant `pay_link`, `willSend` true). Map results back to rows by `enrollmentId`.
- Keep `fetchPayLink` as-is (it already swallows errors and returns `null`), so one bad link never breaks the whole preview.
- No change to send-mode behavior — send mode still calls `fetchPayLink` per row inline right before texting (it already needs the link at that moment).

Result: preview for ~30 enrollments finishes in one Stripe round-trip's worth of time instead of 30, well inside the response window, so `rows` arrives intact.

### 2. `src/components/admin/StartReminderPreviewDialog.tsx`

- Defensive guard in `loadPreview`: coerce `resp.rows` with `Array.isArray(resp.rows) ? resp.rows : []` before the `for…of` seed loop, so a malformed response can never throw an unhandled rejection.
- If `rows` came back empty but the summary counts are non-zero, show a small inline warning ("Preview returned counts but no rows — try Refresh.") instead of the generic empty state, so the failure mode is visible instead of silent.

Nothing else in the dialog changes — same table, same checkboxes, same two send buttons, same test-phone routing.

## Files touched

Edited:
- `supabase/functions/send-session-start-reminders/index.ts`
- `src/components/admin/StartReminderPreviewDialog.tsx`

## Out of scope

- No changes to the Stripe webhook, `get-or-create-session-payment-link`, `reminder_logs`, or any other reminder flow.
- No UI redesign — same dialog, same buttons.
