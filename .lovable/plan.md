# Visitor Waivers

Add a standalone liability + photo consent waiver flow for anyone visiting the pool (not tied to a lesson booking or enrollment), plus an admin tab to view completed waivers, capture new ones on a tablet, and email the signer a copy.

## Public side

- New route `/waivers` added to `PublicLayout` nav between **Enroll** and **Careers**.
- Page shows a short intro + the waiver form. Reuses `<LegalAgreements />` so the language, photo release, and emergency contact fields match the enrollment waiver.
- Adds a "Swimmers covered" repeater above the legal block: name + DOB + relationship to signer (1–6 rows).
- On submit: insert row into new `visitor_waivers` table, capture IP, then trigger an email confirmation with a copy of the waiver (see Email section). Success screen says "Waiver received — a copy has been sent to your email. Please check in at the front desk."
- No login required.

## Admin side

- New sidebar item **Waivers** (Compliance area).
- Route `/admin/waivers` with:
  1. **Completed waivers** table — searchable: signer name, email, phone, swimmers (count + names), photo consent Y/N, signed date, source (`visitor` | `lesson` | `enrollment`). Source filter, date range, search. Row click → drawer with full detail (signature text, IP, versions, swimmers, emergency contact, "Resend copy to signer" button).
  2. **Complete new waiver** button (top-right) → full-screen dialog with the `<LegalAgreements />` flow + amber "hand the device to the signer" banner (mirrors `FrontDeskWaiverDialog`). Submits as `source = 'kiosk'`, `completed_by_staff_id = auth.uid()`, and also emails the signer a copy.
- The list surfaces lesson + enrollment waivers (from `enrollment_agreements`) alongside visitor waivers, with a "Visitors only / All sources" filter.

## Email confirmation

- New transactional email template `visitor-waiver-copy` in `supabase/functions/_shared/transactional-email-templates/` and registered in `registry.ts`.
- Template content: branded header, "Thanks for signing your waiver" message, signed date, swimmers covered, photo release Y/N, emergency contact, full waiver/TOS/privacy version IDs, and a plain-text rendering of the waiver body (built from `legal-content.ts`) so the signer has a real copy.
- Triggered from the client after a successful insert (both public form and admin kiosk dialog) via `supabase.functions.invoke('send-transactional-email', { body: { templateName: 'visitor-waiver-copy', recipientEmail, idempotencyKey: \`visitor-waiver-${id}\`, templateData: { ... } } })`.
- Admin drawer's "Resend copy" button calls the same function with a fresh idempotency key (`visitor-waiver-${id}-resend-${Date.now()}`).
- Requires the project's existing email domain + email infrastructure. The agent will verify domain status before scaffolding and, if missing, set up infrastructure first.

## Technical details

**New table `public.visitor_waivers`**
- `id`, `signer_first_name`, `signer_last_name`, `signer_email`, `signer_phone`, `signature_text`
- `waiver_accepted`, `terms_accepted`, `privacy_policy_accepted`, `photo_release_accepted` (bool)
- `emergency_contact_first_name`, `_last_name`, `_phone`, `_relationship`
- `swimmers` jsonb `[{ first_name, last_name, dob, relationship }]`
- `waiver_version`, `tos_version`, `privacy_policy_version` (defaults from `legal-content.ts`)
- `signer_ip text`, `source text default 'public'` (`'public' | 'kiosk'`), `completed_by_staff_id uuid` (nullable)
- `email_sent_at timestamptz` (set after the confirmation email is queued)
- `signed_at`, `created_at`

**GRANTs + RLS**
- `GRANT INSERT ON public.visitor_waivers TO anon, authenticated` (public form needs to insert).
- `GRANT SELECT, UPDATE, DELETE ON public.visitor_waivers TO authenticated` — gated by RLS to admins only.
- `GRANT ALL ON public.visitor_waivers TO service_role`.
- Policies: `INSERT` allowed to anyone with `WITH CHECK (true)`; `SELECT/UPDATE/DELETE` gated by `has_role(auth.uid(), 'admin')`.

**Files**
- New: `src/pages/Waivers.tsx`, `src/pages/admin/WaiversAdmin.tsx`, `src/components/admin/waivers/WaiverDetailDrawer.tsx`, `src/components/admin/waivers/FrontDeskVisitorWaiverDialog.tsx`, `src/lib/visitorWaiver.ts`, `supabase/functions/_shared/transactional-email-templates/visitor-waiver-copy.tsx`.
- Edit: `src/App.tsx` (routes), `src/components/Navbar.tsx` (Waivers link), `src/components/admin/AdminSidebar.tsx` (Waivers item), `supabase/functions/_shared/transactional-email-templates/registry.ts` (register template), redeploy `send-transactional-email`.
- Migration: create `visitor_waivers` with grants + RLS.

## Out of scope

- No PDF export (email copy is HTML; can add PDF later).
- No annual re-sign reminders.
- No edits to existing lesson or enrollment waiver flows.
