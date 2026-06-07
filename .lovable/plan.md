## Problem

When a parent picks a level/session that just filled up, the current flow either:
- bounces them back to the session step with a small destructive toast ("Session full"), or
- (if they race past the pre-check) returns a 409 from `create-checkout` that surfaces in Stripe's embedded checkout as a generic "merchant" / "failed to start" error.

Parents read both as "something is broken" and call the front desk. They are never told *why* and never offered an alternative.

## Goal

When a session is full at any point in the flow, show a clear, friendly screen that:
1. Confirms the level/session they wanted.
2. Captures their info as a waitlist entry (saved to the database).
3. Emails the owner so they know demand exists for that level.
4. Offers concrete next steps: book a private lesson, pick a different session, or wait for an opening.

## Plan

### 1. New `waitlist_requests` table

Columns: parent first/last/email/phone, child first/last/age, requested swim level, requested session id (nullable), source page, status (`new`, `contacted`, `enrolled`, `closed`), notes.

- RLS: anyone can INSERT (public form), admins SELECT/UPDATE.
- GRANTs: `anon` + `authenticated` INSERT; `authenticated` admin SELECT/UPDATE; `service_role` ALL.
- Standard `created_at`/`updated_at` + update trigger.

### 2. New `session-full` screen in the enrollment flow

Add a `"full"` step to `SwimEnrollment.tsx`, rendered by a new component `SessionFullFallback.tsx`. Shown whenever:
- the pre-Stripe capacity check in `handleSubmit` (line 261) detects a full session, or
- `create-checkout` returns a 409 `"is full"` error (intercept in `EnrollmentCheckout.tsx` and route to the same step instead of toasting).

The screen shows:
- "[Level name] — [Session name] is full" with the parent/child info we already have.
- A primary CTA: **Book a private lesson** (links to `/book-private-lesson` with $50 June promo callout — pricing already in memory).
- A secondary CTA: **Pick a different session** (returns to session step, preselects the level).
- A tertiary CTA: **Join the waitlist** — confirms the row was saved (auto-submitted on entry to the step) and shows "We'll email you the moment a seat opens. The owner has been notified."

### 3. New edge function `submit-waitlist-request`

- Validates input with Zod, inserts into `waitlist_requests`, fires two emails through `send-transactional-email`:
  - **Parent confirmation** (`waitlist-confirmation` template) — "You're on the list for [Level] · [Session]. While you wait, here's a $50 private lesson option."
  - **Owner notification** (`waitlist-owner-alert` template) — sent to the contact email in memory, includes parent/child/level/session/phone + direct link to the new admin tab.
- Idempotency key: `waitlist-${requestId}` for parent, `waitlist-owner-${requestId}` for owner, so retries don't double-send.

### 4. Two new app email templates

Add to `supabase/functions/_shared/transactional-email-templates/`:
- `waitlist-confirmation.tsx`
- `waitlist-owner-alert.tsx`

Register both in `registry.ts`. Brand-styled (maritime palette already in other templates). Deploy edge functions after.

### 5. Surface the waitlist in admin

New tab in `SwimEnrollmentsAdmin.tsx` ("Waitlist") that lists `waitlist_requests` with status badges and quick actions: mark contacted, mark enrolled, archive. No new page needed.

### 6. Replace the bad UX in `SessionPicker.tsx`

On full rows the button is already disabled; add a small inline "Join waitlist" link next to "Full" that opens the same `SessionFullFallback` panel pre-filled — so parents who notice the full label before continuing also get a clear path.

### 7. Harden `create-checkout` error path

In `EnrollmentCheckout.tsx`, when invoke returns a 409 with `"is full"` in the message, do not throw — call `onSessionFull(sessionId)` so the parent never sees Stripe's generic gateway error.

## Out of scope

- Auto-opening a seat / promoting the next person off the waitlist when someone cancels (manual for now — owner does it from the new tab).
- SMS notifications.
- Changing pricing or any payment behavior.

## Technical details

- Files added: `supabase/migrations/<ts>_waitlist_requests.sql`, `supabase/functions/submit-waitlist-request/index.ts`, `supabase/functions/_shared/transactional-email-templates/waitlist-confirmation.tsx`, `supabase/functions/_shared/transactional-email-templates/waitlist-owner-alert.tsx`, `src/components/swim-enrollment/SessionFullFallback.tsx`.
- Files edited: `src/pages/SwimEnrollment.tsx` (add `"full"` step + handler), `src/components/swim-enrollment/EnrollmentCheckout.tsx` (intercept 409), `src/components/swim-enrollment/SessionPicker.tsx` (waitlist link on full rows), `supabase/functions/_shared/transactional-email-templates/registry.ts`, `src/pages/admin/SwimEnrollmentsAdmin.tsx` (new tab).
- No changes to Stripe, pricing, or existing enrollment writes.
