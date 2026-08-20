# Rolling occurrence generation

Membership lesson dates currently stop at 2026-10-19. Each membership only got about 8 weeks of lessons at checkout and nothing extends them. This adds a nightly job that keeps every active roster stocked 12 weeks out.

## What gets built

A new backend job, `extend-membership-occurrences`, that runs every night and tops up lesson dates for memberships that are active or in their cancellation notice period. It never edits or removes existing lesson dates, only fills in missing future ones.

## Behavior

For each membership with status `active` or `pending_cancel`:

- No class time assigned: skipped, counted, and reported back. Not an error. (Currently zero such memberships.)
- Reads the assigned class time for weekday, start, end, and instructor.
- Loads studio closure dates and skips them, exactly as checkout does today.
- Starts the day after that membership's latest existing lesson date; if it has none, starts today.
- Generates forward to today + 12 weeks. The shared generator takes a lesson count, not an end date, and skips closures, so the count is computed from calendar weeks between the start and the horizon and the generator is called once. A long closure (Winter Break, Dec 24 to Jan 1) can push the last date slightly past the horizon. That is accepted; no looping or count reduction.
- `pending_cancel`: no dates after `cancel_effective_date`.
- Each membership runs in its own try/catch. One failure never aborts the sweep; failures are collected and returned.

Response JSON: memberships processed, occurrences created, skipped for no class time, skipped for cancel date, and errors.

## Technical details

- New function `supabase/functions/extend-membership-occurrences/index.ts`.
- Auth: service-role bearer or `CRON_SECRET` header, matching `send-lesson-occurrence-reminders`. No anon JWT.
- Imports `buildMembershipOccurrenceRows` from `supabase/functions/_shared/membership-occurrences.ts` unchanged, and `fetchClosureDateSet` from `supabase/functions/_shared/closure-schedule.ts` (already exposed) for the closure set.
- Insert via upsert with `onConflict: "membership_id,occurrence_date"` and `ignoreDuplicates: true`. The existing unique index on `(membership_id, occurrence_date)` is the idempotency guard, so repeated or overlapping runs are safe.
- `verify_jwt = false` entry in `supabase/config.toml`; the in-code guard does the auth.
- pg_cron job `extend-membership-occurrences-daily` at `0 8 * * *`, using the same vault pattern as the existing reminder crons:

```text
Authorization: Bearer <vault secret email_queue_service_role_key>
```

  This runs before the reminder jobs at 14:00-17:00 UTC, so newly generated lessons are always visible to reminders. Scheduled with the data tool, not a migration, since it embeds project-specific values.

## Out of scope

No changes to `buildMembershipOccurrenceRows`, `memberships`, `standing_slots`, Stripe, or the payments webhook. No UPDATEs to existing `membership_occurrences` rows. No generation for `paused` or `cancelled`. Closed dates are skipped at generation, never written as closed rows.

## Verification after build

- Invoke once manually and confirm the summary counts.
- Confirm `max(occurrence_date)` moves from 2026-10-19 to roughly 12 weeks out.
- Invoke a second time and confirm zero occurrences created (idempotent).
- Confirm no existing row was modified (row count for dates on or before 2026-10-19 unchanged).
