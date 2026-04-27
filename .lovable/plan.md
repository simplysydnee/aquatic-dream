## Goal

Add a **"View Email"** action to each row in `/admin/emails` so you can see the actual subject + rendered HTML of the email that was sent (not just the metadata).

## Approach

Emails are React Email templates rendered server-side at send time. We don't currently store the rendered HTML. The cleanest approach is:

1. **Capture template data** when an email is sent (small change to send pipeline).
2. **Re-render on demand** in a new admin-only edge function using the stored template name + data.
3. **Add a "View" button** in the Email Log that opens a dialog showing the subject and rendered HTML in an iframe.

This avoids bloating the database with HTML for every email, keeps renders always up-to-date with template changes, and gives admins true "see what was sent" visibility.

## Changes

### 1. Database migration
- Backfill is not needed. New sends will populate `email_send_log.metadata` with `{ template_data: {...} }`. Existing rows without it will show a friendly "Preview unavailable for older emails" message.

### 2. Send pipeline updates
Update these edge functions to write `template_data` into `metadata` on the initial `pending` insert (and propagate on retries):
- `supabase/functions/send-transactional-email/index.ts`
- `supabase/functions/process-email-queue/index.ts`
- `supabase/functions/auth-email-hook/index.ts` (auth emails — store the auth event payload, redacting tokens)

Sensitive values (unsubscribe tokens, magic links, OTPs, password reset tokens) will be **redacted** before storage and re-injected with placeholder text like `[redacted-link]` at render time.

### 3. New edge function: `render-email-preview`
- Admin-only (verifies caller has `admin` role via JWT + `has_role`).
- Input: `{ log_id }`.
- Looks up the row, finds the template in the registry, re-renders with stored `template_data`, returns `{ subject, html }`.
- For `auth_emails` rows, uses the auth email templates in `supabase/functions/_shared/email-templates/`.
- For rows with no stored data, returns a 404 with a clear message.

### 4. Email Log UI (`src/pages/admin/EmailLogAdmin.tsx`)
- Add a **"View"** button (eye icon) in each table row, next to the chevron.
- Clicking opens a new `EmailPreviewDialog` component:
  - Header: subject + recipient + sent timestamp + status badge.
  - Body: rendered HTML inside a sandboxed `<iframe srcDoc={html}>` so styles don't leak into the admin UI.
  - Footer: "Open in new tab" button (opens HTML in a blob URL).
- Loading state while fetching from the edge function.
- Empty state for older rows with no captured data.

## Files

**New:**
- `supabase/functions/render-email-preview/index.ts`
- `supabase/functions/render-email-preview/deno.json`
- `src/components/admin/EmailPreviewDialog.tsx`

**Edited:**
- `src/pages/admin/EmailLogAdmin.tsx` — add View button + dialog wiring
- `supabase/functions/send-transactional-email/index.ts` — store template_data in metadata
- `supabase/functions/process-email-queue/index.ts` — same
- `supabase/functions/auth-email-hook/index.ts` — same (with token redaction)

## Notes

- Re-rendering means the preview reflects the **current** template code, not the exact bytes sent. If a template was edited after the send, the preview shows the updated layout with the original data. This is usually what admins want; happy to instead store rendered HTML if you prefer historical fidelity (trade-off: ~10-50KB per row in DB).
- Sensitive tokens are never stored or shown in previews.