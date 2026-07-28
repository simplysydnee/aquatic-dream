## Schema findings (read before planning, differs from the prompt in three places)

- `membership_occurrences`: `id, membership_id, occurrence_date, start_time (nullable), end_time (nullable), instructor_id (nullable), status, closure_type, cancel_reason, closure_id, created_at`. Confirmed: no payment fields. The time and instructor columns ARE the overrides (nullable, fall back to the standing slot). There is no `*_override` naming.
- `memberships` has no emergency contact columns. Emergency contact lives on `visitor_waivers` via `memberships.waiver_id` (`emergency_contact_first_name`, `_last_name`, `_phone`, `_relationship`). Memberships do carry `medical_notes` and `notes`.
- `standing_slots` carries `swim_level` (used for the group level label), plus `day_of_week`, `start_time`, `end_time`, `instructor_id`, `location`, `capacity`.
- `membership_plans.name` values are exactly: Private Swim, Adult Swim, Small Group Swim.

Current data: one membership (Taylen Merchant, plan `private`, Wed 4:00pm standing slot with NO instructor, membership status `pending_cancel`), 7 `scheduled` occurrences and 1 `cancelled`. Because that slot has no instructor, this lesson will land in the Unassigned group — that is expected behavior, not a bug. Membership status is not used to filter; occurrence `status = 'scheduled'` is the single source of truth, so a pending-cancel membership still shows its remaining scheduled lessons (which is correct: they are still coming to those lessons).

## 1. useCalendarData.ts

Add one query to the existing `Promise.all`, windowed on `occurrence_date` between `rangeStart` and `rangeEnd`, filtered `.eq("status", "scheduled")`, selecting the occurrence plus nested `memberships!inner(..., standing_slots(...))`. A second lookup resolves `membership_plans` (plan_key to display name) and, for emergency contact, `visitor_waivers` by the memberships' `waiver_id` values.

New exported `MembershipLesson` interface, shaped after `PrivateLessonBooking`:

```text
occurrence_id, membership_id, plan_key, plan_name,
instructor_id, instructor_name, swimmer_name, parent_name,
parent_email, parent_phone, occurrence_date,
start_time, end_time, location, swim_level,
notes, medical_notes,
emergency_contact_name, emergency_contact_phone, emergency_contact_relationship
```

Resolution rules: `start_time`/`end_time`/`instructor_id` from the occurrence when set, otherwise the standing slot. Instructor name resolved from the existing `_instructorNameMap`. No payment, charge, or card fields anywhere on this type.

Return `membershipLessons` from the hook alongside the existing arrays. Nothing in the private/group/enrollment queries, `DEAD_STATUS_FILTER`, `isRealLessonOccurrence`, or `openPrivateSlots` changes.

## 2. Calendar rendering

`CalendarAdmin.tsx` passes `membershipLessons` to `CalendarDayView`. In `CalendarDayView`, mirror the existing `privateLessonGridEvents` memo with a `membershipGridEvents` memo producing synthetic pool-event-shaped objects (`id: "ml:<occurrence_id>"`, carrying `__membershipLesson`), merged into `adEvents` so they use the existing lane assignment and time positioning, and into the AD column fallback count.

Three new entries in the day-view color map so the plans are visually distinct from each other and from legacy private bookings:

```text
membership-private   teal fill / teal border
membership-adult     coral fill / coral border
membership-group     royal blue fill / royal blue border
```

Each block shows a small "Membership" tag plus the plan name so a membership lesson never reads as a legacy private booking. They also appear in the mobile agenda list alongside the other item types. Clicking opens a read-only detail popover with swimmer, parent, phone, time, instructor, and notes — no charge or payment actions.

`PrivateLessonsPanel` is left untouched.

## 3. PrintDaySchedule.tsx

Add the same query for the single `date`, same `scheduled` filter and joins, into the existing `Promise.all`. New `MembershipOccurrence` local interface and a `{ kind: "membership" }` variant on the `Item` union.

- Grouped into the same instructor map, keyed `instructor_id || "unassigned"`.
- Counted in `classCount` and `totalSwimmers` (1 swimmer per row) so pages are no longer filtered out by the `totalSwimmers > 0` guard.
- Row uses the existing Time / Class / Swimmer / Parent / Emergency / Notes columns with its own left stripe color per plan.
- Class column: plan name, plus the standing slot's level for Small Group Swim, plus location where present.
- Emergency column: waiver contact when one exists, otherwise the same em-dash the private rows use.
- `needsCardAtDesk` and the card-at-desk warning are NOT applied to membership rows.
- Instructor URL filtering (`?instructor=`) applies the same way it does to private rows.

## Verification

Load the admin calendar on Wed 2026-08-19 and confirm Taylen Merchant's 4:00 to 4:30 Private Swim renders under Unassigned; open `/admin/print-day?date=2026-08-19` and confirm the same lesson on the Unassigned page with correct counts; spot-check an existing group and private day to confirm identical rendering to before; confirm the `cancelled` occurrence and any closure-`closed` occurrence appear on neither surface.

## Out of scope

No schema, RLS, Stripe, checkout, or enrollment changes. No memberships admin page. No payment fields on membership rows.
