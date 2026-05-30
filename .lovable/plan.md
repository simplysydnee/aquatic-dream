## Problem

Public visitors at `/waivers` can't submit the form. The `visitor_waivers` table has a correct INSERT policy (`Anyone can submit visitor waiver`, roles `public`, `WITH CHECK true`), no blocking triggers, and no check constraints — but the table has **zero table-level GRANTs**. Without `GRANT INSERT` to `anon` (and `authenticated` for kiosk staff), PostgREST rejects the insert. Supabase often surfaces this as the RLS violation message the user is seeing.

## Fix

Run a migration that grants the missing privileges on `public.visitor_waivers`:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitor_waivers TO authenticated;
GRANT INSERT ON public.visitor_waivers TO anon;
GRANT ALL ON public.visitor_waivers TO service_role;
```

- `anon` gets INSERT only — matches the public submission policy at `/waivers`. No SELECT for anon (waivers contain PII; admins read via the existing authenticated policy).
- `authenticated` gets full CRUD — RLS still scopes reads/updates/deletes to admins via existing policies, and kiosk staff inserts still work.
- `service_role` gets ALL — required for the `send-transactional-email` flow and any backend updates (e.g. `email_sent_at`).

## Out of scope

No code changes to `VisitorWaiverForm.tsx` or `submitVisitorWaiver` — they're already correct. No RLS policy changes.