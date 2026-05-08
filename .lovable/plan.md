## Goal

One swimmer modal — the "source of truth" — opens from any admin page (Swim Enrollments, Calendar, Lesson Requests, Class Roster, Clients) by clicking the swimmer's name. Same component, same data, no duplicates.

## Identity & dedup

- Swimmer identity = `lower(trim(child_name)) + lower(parent_email)` — already used by `useSwimmers`. The modal pulls from that hook so a child with both a class enrollment and a private booking shows as one record with both listed.
- Display-only merge — no DB writes, no schema changes.

## Modal structure

Reuse and extend the existing `SwimmerDetailDrawer` (right-side Sheet). Header: swimmer name, age, level badge, status chips, and a **pencil edit button** (admin-only) that opens the existing `EditSwimmerDialog`.

Tabs:

1. **Info** — swimmer details, parent contact, lifetime stats, siblings (already exists).
2. **Enrollments** — every `swim_enrollments` row for this swimmer, grouped Upcoming / Active / Past with session period, level, day/time, instructor. "Open" jumps to the existing enrollment detail dialog.
3. **Lessons** — `lesson_requests` + `lesson_bookings` + `lesson_booking_occurrences` (attended / scheduled private & semi-private). Each row links to calendar or request detail.
4. **Communications** — Read + simple draft.
   - Timeline of all `email_send_log` rows where `recipient_email = parent_email` (template name, status, sent date, click to expand metadata).
   - "Compose email" form (subject + plain-text body) that sends via `send-transactional-email` using a new lightweight `admin-freeform` template path. Note in UI: outbound only — inbound replies aren't tracked yet.
5. **Payments** — Per-enrollment and per-lesson-occurrence rows with: amount, status (Reg / Session / Lesson), Stripe session id (link), paid date, method/reference. Outstanding balance summary at top. Actions per row:
   - **Mark paid (cash / check / comp)** — updates `payment_status` or `session_fee_status` + `payment_method` + `payment_reference`.
   - **Send Stripe payment link** — calls existing `send-session-payment-link` (enrollments) or `create-lesson-occurrence-checkout` (private lessons) and emails the parent.
   - These actions also remain on the existing `SwimEnrollmentsAdmin` rows and Calendar lesson dialogs (no removal).
6. **Notes** — existing `InternalCommentsPanel` keyed by `swimmer.key`.

## Wiring (click-through entry points)

Add a `useSwimmerModal()` context provider mounted once in `AdminLayout` so any list can call `openSwimmer({ child_name, parent_email })` and the same drawer renders. The provider loads the matching `Swimmer` from the `useSwimmers` cache (or fetches on demand if the cache is empty).

Pages updated to make swimmer names clickable:
- `SwimEnrollmentsAdmin` (table + per-session cards)
- `SessionEnrollmentCards` (currently shows roster but no click)
- `CalendarAdmin` (lesson booking + enrollment popovers)
- `LessonRequestsAdmin`
- `ClassRosterAdmin`
- `ClientsAdmin` (already wired — switch to context)

## Edit swimmer

Pencil icon in modal header (admin only) reuses existing `EditSwimmerDialog`. Saves propagate through realtime channels already in `useSwimmers`.

## Data / backend

No new tables. No schema changes. Uses existing:
- `swim_enrollments`, `lesson_bookings`, `lesson_booking_occurrences`, `lesson_requests`
- `email_send_log` (read), `send-transactional-email` (compose)
- `payment_status`, `session_fee_status`, `payment_method`, `payment_reference` columns
- `send-session-payment-link`, `create-lesson-occurrence-checkout` edge functions

One small addition: a generic `admin-freeform` template entry in the transactional email registry so admins can send arbitrary subject/body to a parent from the Communications tab.

## Files

New:
- `src/components/admin/swimmer/SwimmerModalProvider.tsx` (context + open/close)
- `src/components/admin/swimmer/SwimmerLink.tsx` (button that triggers the modal)
- `src/components/admin/swimmer/tabs/CommunicationsTab.tsx`
- `src/components/admin/swimmer/tabs/PaymentsTab.tsx`
- `supabase/functions/_shared/transactional-email-templates/admin-freeform.tsx`

Edited:
- `src/components/admin/clients/SwimmerDetailDrawer.tsx` — restructure tabs, add header pencil
- `src/pages/admin/AdminLayout.tsx` — mount provider
- `SwimEnrollmentsAdmin.tsx`, `SessionEnrollmentCards.tsx`, `CalendarAdmin.tsx`, `LessonRequestsAdmin.tsx`, `ClassRosterAdmin.tsx`, `ClientsAdmin.tsx` — replace plain names with `<SwimmerLink>`
- `supabase/functions/_shared/transactional-email-templates/registry.ts` — register new template

## Out of scope (per your answers)

- No DB-level dedup pass.
- No inbound/received email tracking (note shown in UI; webhook can be a follow-up).
- No template picker in compose (subject + body only).
