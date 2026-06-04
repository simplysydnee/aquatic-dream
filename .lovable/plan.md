## Goal

Welcome email gets an **Add to Calendar** section (Apple/Outlook .ics + Google Calendar) that includes every lesson date for every one of that parent's swimmers in the current session period, plus the facility address. Each parent gets one combined email instead of one per child.

## What changes

### 1. Multi-event calendar support

`supabase/functions/lesson-calendar-ics/index.ts`
- Add a new `events` query param (base64-encoded JSON of `[{uid,title,date,start,end,location?,desc?}]`).
- When present, emit one VEVENT per entry (each with its own title/time). Existing single/multi-date modes stay unchanged so other emails keep working.

`supabase/functions/_shared/calendar-links.ts`
- Add `buildMultiEventCalendarLinks(events[])` returning `{icsUrl, googleUrl}`.
  - `icsUrl` → new endpoint with base64 `events` param.
  - `googleUrl` → pre-fills only the very first event (Google's render endpoint is one-event-only); the .ics covers everything.

### 2. Welcome email orchestrator

`supabase/functions/send-session-welcome-email/index.ts`
- Resolve the target `sessionPeriodId`. If invoked with a single `enrollmentId`, look up its session's `session_period_id`.
- Group enrollments by `lower(parent_email)` within that session period (`status in confirmed/enrolled/pending_payment/pending`).
- For each parent group:
  - Pick one Stripe payment link: keep current per-enrollment logic but only attach a link if at least one enrollment still owes the session fee (use the first unpaid enrollment).
  - Build the combined event list: for each enrollment, pull `session_lesson_dates` (non-cancelled), one VEVENT per date with title `"<swimmer first name> — <className> (<time>)"` and location `1212 Kansas Ave, Modesto, CA 95351`.
  - Build a `swimmers[]` array for the template: `{swimmerName, className, classDays, classTime, alreadyPaid}`.
  - Send one email per parent. Idempotency key: `session-welcome-${sessionPeriodId}-${lower(parent_email)}`.
  - Stamp `session_welcome_sent_at = now()` on every enrollment in the group.

### 3. Email template

`supabase/functions/_shared/transactional-email-templates/session-welcome.tsx`
- Replace single-swimmer fields with an optional `swimmers[]` array. Keep the existing single-swimmer fields as a fallback so other callers don't break.
- New "📅 Add to Your Calendar" section with two buttons: **Apple / Outlook (.ics)** and **Google Calendar**, plus the studio address as a Google Maps link.
- Tuition card adapts: if every swimmer is paid, show the paid banner; otherwise show one "Complete Tuition Payment" button using the orchestrator-supplied link.
- Update `previewData` to show two swimmers + sample calendar links.

### 4. Registry / deploy

- No registry change (template name stays `session-welcome`).
- Deploy `lesson-calendar-ics`, `send-session-welcome-email`, and `send-transactional-email` after edits.

## Out of scope

- No DB schema changes.
- No changes to enrollment confirmation email, payment-link generation, or other email flows.
- No changes to the admin UI that triggers welcome sends (it just keeps calling the same edge function; behavior under the hood now dedupes per parent).

## Test plan

1. Re-trigger the welcome email for enrollment `efd9d55c-…` (sydneesmerchant@gmail.com).
2. Confirm one email arrives, lists Weston's class, has both calendar buttons.
3. Click .ics → opens calendar with all 8 lesson dates at the correct PT times and the Modesto address.
4. Click Google → opens Google Calendar prefilled for the first lesson.
5. Add a second test enrollment for the same parent_email + same session period → re-send → verify a single email lists both swimmers and the .ics now has both kids' dates.
