# Split Names into First + Last Across the App

## Goal
Stop swimmers being entered with no last name. Capture **first name** and **last name** separately for the **swimmer**, **parent/guardian**, and **emergency contact** everywhere they're entered, and surface both fields everywhere they're displayed.

## Database Changes (migration)

Add new columns alongside the existing combined fields. We **keep** the legacy `*_name` columns and continue writing the combined value into them, so nothing existing breaks (rosters, emails, edge functions, Stripe metadata, instructor views, etc. keep working without touching them).

| Table | New columns |
|---|---|
| `swim_enrollments` | `child_first_name text`, `child_last_name text`, `parent_first_name text`, `parent_last_name text` |
| `lesson_requests` | `child_first_name text`, `child_last_name text`, `parent_first_name text`, `parent_last_name text` |
| `lesson_bookings` | `child_first_name text`, `child_last_name text`, `parent_first_name text`, `parent_last_name text` |
| `pool_events` | `client_first_name text`, `client_last_name text` (the "client_name" column on calendar events) |
| `enrollment_agreements` | `signer_first_name text`, `signer_last_name text`, `emergency_contact_first_name text`, `emergency_contact_last_name text` |

Backfill rule (per user choice): for every existing row, copy the entire legacy value into `*_first_name` and leave `*_last_name` NULL. No guessing.

New columns are nullable for now. After rollout we can flip the new columns to `NOT NULL` and stop writing the legacy concatenated columns; that's a follow-up, not this task.

## Form Changes (intake)

Replace single name inputs with paired First / Last inputs. Both required, trimmed, max 100 chars each.

- `EnrollmentForm.tsx` — Swimmer (`childFirstName` + `childLastName`) and Parent/Guardian (`parentFirstName` + `parentLastName`).
- `LessonRequestForm.tsx` — same swimmer + parent split.
- `LegalAgreements.tsx` — split **Signer** name and **Emergency Contact** name into First/Last.
- `AddPoolEventDialog.tsx` / `LessonBookingFields.tsx` / `FrontDeskWaiverDialog.tsx` (admin calendar walk-in / booking entry) — split swimmer, parent, and (where applicable) client name.
- `AddSwimmerDialog.tsx` (admin "add swimmer to class") — split swimmer + parent.

On submit, write both the new split columns **and** the combined legacy column (`first + ' ' + last`) so nothing downstream breaks.

## Admin View Changes (display + edit)

Show First Name and Last Name as separate columns/inputs and use `last, first` ordering where it helps scanning a roster.

- `SwimEnrollmentsAdmin.tsx` table — replace single "Child" column with **Last Name** + **First Name** columns; same for Parent. Sort defaults to last name. Search matches either field.
- `EnrollmentDetailDialog.tsx` — split Child Name and Parent Name into two inputs each; add Emergency Contact first/last.
- `ClassRosterAdmin.tsx` — show "Last, First" for swimmers, sort by last name.
- `ClientsAdmin.tsx` + `SwimmerDetailDrawer.tsx` — show split names, group siblings by parent last name.
- `LessonRequestsAdmin.tsx` + `LessonRequestDetailDialog.tsx` — split fields.
- `KioskCheckIn.tsx` — show "Last, First" so families find their kid faster.
- `InstructorMyRoster.tsx` — show "Last, First".
- `ReportsAdmin.tsx`, `SessionEnrollmentCards.tsx`, `CalendarBlockDetail.tsx`, `CalendarDayView.tsx` — display split names.

## Helpers

Add a tiny shared helper (e.g. `src/lib/names.ts`):

```ts
export const fullName = (first?: string | null, last?: string | null, fallback = "") =>
  [first, last].filter(Boolean).join(" ").trim() || fallback;

export const lastFirst = (first?: string | null, last?: string | null, fallback = "") =>
  last ? `${last}, ${first ?? ""}`.trim() : (first ?? fallback);
```

Display code reads the new columns first and falls back to the legacy `*_name` for legacy rows where last name is blank.

## Edge Functions

Light updates only — they keep using the combined legacy field for emails / Stripe metadata. We just make sure inserts include the new split columns:

- `admin-create-enrollment` — accept and store `child_first_name`, `child_last_name`, `parent_first_name`, `parent_last_name`.
- `payments-webhook` / `create-checkout` — pass split names through Stripe metadata so the webhook writes both.
- `cancel-enrollment-refund`, `send-session-payment-link`, `send-lesson-booking-confirmation`, `send-lesson-reminders`, `create-lesson-occurrence-checkout` — no change required (they read `child_name` / `parent_name`, which we keep populated).

## Out of Scope
- Dropping or renaming the legacy `child_name` / `parent_name` / `client_name` / `signer_name` / `emergency_contact_name` columns. We keep them populated for now so legacy emails, Stripe metadata, and instructor views keep working unchanged. Cleanup is a future task once you've confirmed a few weeks of clean data.
- Auto-merging duplicate swimmer records.
