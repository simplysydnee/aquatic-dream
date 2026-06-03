## Goal
Make Campaigns able to target real enrollment groups and inquiry types so admins can send reminders, schedule changes, and program announcements to the exact parents that need them.

## New audience selectors (added to the existing tag/source picker)

In the campaign editor's Audience panel, add four new sections. Any combination is OR'd together with current tag/source filters, then de-duped by email.

1. **Session period** — multi-select of all `session_periods` (e.g. "Session 1 — Fall 2026"). Resolves to every parent_email on `swim_enrollments` whose `session_id` belongs to a `swim_sessions` row in that period, status in (pending, confirmed, enrolled, pending_payment).

2. **Class(es)** — searchable multi-select of `swim_sessions` (active), grouped by period and labeled `Level · Day · Time · Instructor`. Resolves to enrolled parent_emails for the chosen sessions. Lets you message a single class (e.g. "Monday 3:15 Little Fins") or several at once.

3. **Swim level** — multi-select of the 5 levels (White, Red, Yellow, Blue, Green). Resolves to currently-enrolled parents at that level (across all active periods). Useful for "all Yellow families this session".

4. **Lesson interest** — multi-select chips for `private`, `semi-private`, `adult`, derived from `lesson_requests.lesson_type` / `is_adult_swimmer`, plus an age toggle (under 14 / 14+). Resolves to parent_emails from `lesson_requests`.

The existing Tags and Sources sections stay (for broad blasts and ad-hoc tags like `private-lesson-inquiry-u14`). A live "Audience: N subscribed contacts" count updates as selectors change.

## Backend changes

- **`marketing_campaigns.audience` (jsonb)** — extend the shape (no schema change needed, it's jsonb):
  ```
  {
    tags: [], sources: [], include_all: false,
    session_period_ids: [uuid],
    swim_session_ids: [uuid],
    swim_levels: ["yellow", ...],
    lesson_interests: ["private","semi-private","adult"],
    lesson_interest_age: "u14" | "14plus" | "all"
  }
  ```

- **`send-marketing-campaign` edge function (`resolveAudience`)** — after pulling tag/source matches from `marketing_contacts`, run additional queries:
  - `swim_enrollments` joined to `swim_sessions` for period/session/level filters
  - `lesson_requests` for interest filters
  Collect every parent_email, lower-case + dedupe, then look up (or upsert) matching `marketing_contacts` rows so suppression, unsubscribe tokens, and recipient logging keep working. Skip anyone in `suppressed_emails` or with `subscribed = false`.

- **`preview-marketing-campaign`** — accept the same audience shape so the editor can show an accurate count + first-10 sample recipients.

## Frontend changes

- `src/pages/admin/MarketingAdmin.tsx` — new `AudienceBuilder` component replacing the current tag/source block. Loads `session_periods`, `swim_sessions` (with instructor + period), and distinct lesson_request interests on mount.
- Count + sample preview pulled from `preview-marketing-campaign`.
- "Send now" confirmation shows resolved recipient count + a short breakdown ("12 from Session 1 · 4 from Yellow level · 3 private-lesson inquirers").

## Files to touch
- `src/pages/admin/MarketingAdmin.tsx` — new audience UI, types, preview count call
- `supabase/functions/send-marketing-campaign/index.ts` — extended `resolveAudience`
- `supabase/functions/preview-marketing-campaign/index.ts` — return audience count + sample

No DB migration required (audience is jsonb; recipients table already supports null `contact_id` for ad-hoc emails, and we'll upsert into `marketing_contacts` so tokens work).

## Out of scope
- Per-recipient personalization tokens (e.g. {{child_name}}) — can be a follow-up.
- SMS reminders.