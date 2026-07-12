## Goal

Let you preview every SMS that would go out — with the real rendered message body, the real Stripe pay link, and the real recipient phone — in a table inside the admin, before a single text hits TextMagic.

## How the preview works

Add a **"Preview messages"** button next to the existing "Text tomorrow's start reminder" button on `/admin/enrollments`.

Clicking it opens a full-screen dialog that shows one row per enrollment that would be texted:

```text
| Send? | Family        | Phone          | Variant     | Message preview                           | Pay link      |
|-------|---------------|----------------|-------------|-------------------------------------------|---------------|
|  ☑    | Sarah Kim     | +1 209 555 ... | Pay link    | Hi Sarah, Mia's first swim lesson...     | stripe.com/...|
|  ☑    | Jose Ruiz     | +1 209 555 ... | Reminder    | Hi Jose, reminder: Leo's first swim...   |    —          |
|  ⚠    | Amy Tran      | (no phone)     | Skipped     | Would not send — no phone on file        |    —          |
|  ⚠    | Ben Cole      | +1 209 555 ... | Already sent| Already texted earlier — will skip        |    —          |
```

At the bottom of the dialog:
- Counts summary (X will send, Y skipped no phone, Z already sent).
- **"Send checked to families"** button (real send, real numbers).
- **"Send checked to my number instead"** with a phone input (routes all checked rows to that one number, same rendered bodies).
- **Cancel** — closes without sending anything.

Nothing is sent until you click one of the two send buttons in that dialog.

## Where the Stripe links come from

The preview call generates the real Payment Links up front (via the existing `get-or-create-session-payment-link` function, which is idempotent and already reuses any link it created before). That means:

- The link you see in the preview is the exact same link the family will receive.
- Re-opening the preview doesn't create duplicate Stripe links — it reuses the ones already stored on the enrollment row.
- No SMS is sent during preview generation.

## Edge function changes

Extend the existing `send-session-start-reminders` function with a new `mode` parameter:

- `mode: "preview"` — resolves sessions, loads enrollments, generates/reuses pay links, returns a JSON array of `{ enrollmentId, family, phone, variant, message, payLink, skipReason }`. Zero calls to TextMagic. Zero `reminder_logs` inserts.
- `mode: "send"` — same as today's real send. Accepts an optional `enrollmentIds` array so the UI can send only the rows you checked in the preview.
- `mode: "send"` with `testPhone` — same as today's test mode, honoring `enrollmentIds`.

The current `dryRun` flag (just returns counts) stays for backward compatibility with the existing summary path, but the new preview mode is the main one you'll use.

## UI changes

- Replace the current confirm-with-counts flow with the new preview dialog.
- Keep the "Test to my number" button available as a shortcut, but it now just opens the same preview dialog with the test-phone field pre-filled.
- The preview table uses your admin spreadsheet style (dense rows, checkboxes, inline info). No card layout.

## Files touched

Edited:
- `supabase/functions/send-session-start-reminders/index.ts` — add `mode: "preview"` branch that returns rendered messages + pay links without sending; accept `enrollmentIds` filter on send.
- `src/pages/admin/SwimEnrollmentsAdmin.tsx` — swap the confirm flow for the new preview dialog.

New:
- `src/components/admin/StartReminderPreviewDialog.tsx` — the preview table, per-row checkboxes, and the two send buttons.

## Out of scope

- No email version, no cron, no changes to any other reminder flow.
- No changes to the Stripe webhook or to how session fees post back.
