## Goal

In the admin's **Add Event** dialog (`AddPoolEventDialog`), replace the free-text "Instructor (optional)" input with a **dropdown of active instructors** pulled from the `instructors` table. Instructors continue to have **no booking ability** in their portal — all private/semi-private bookings remain admin-only.

## What changes

**Single field swap** in `src/components/admin/calendar/AddPoolEventDialog.tsx`:

- Remove the free-text `<Input>` for instructor name (line 512)
- Add a searchable instructor picker (Combobox using shadcn `Command` inside a `Popover`) that:
  - Loads `instructors` where `is_active = true`, sorted by name
  - Shows "— No instructor —" as the first option (to clear / leave unassigned)
  - Stores the selected instructor's **name** into the existing `instructorName` state (no schema change — the rest of the save logic already reads from this state)
  - Pre-fills if editing an existing event whose `instructor_name` matches an active instructor
- If the existing event's `instructor_name` doesn't match any active instructor (legacy data, deactivated instructor), show that name as a non-selectable hint so it's not silently dropped, with a "Change…" affordance

**Applies to all event types** in the dialog (private, semi-private, swim lesson, dive, rental, etc.) — they all share the same instructor field.

## What does NOT change

- No changes to the instructor portal (no self-booking)
- No RLS changes — admin-only stays admin-only
- No schema changes — `pool_events.instructor_name` and `lesson_bookings.instructor_name` stay as `text` columns storing the name string
- Email confirmation, Stripe link, occurrences logic — all untouched

## Technical notes

- New small component `src/components/admin/calendar/InstructorPicker.tsx` (or inline) using `Command` + `Popover`, ~60 lines
- Fetch instructors once when the dialog opens (not on every keystroke)
- Search is client-side filter (typically <30 instructors)

## Out of scope

- Storing `instructor_id` (foreign key) instead of name — would require schema migration and backfill; flag for later if you want stronger data integrity
- Letting instructors create their own bookings
- Filtering instructors by availability/conflicts at the selected time (could add later as a warning)
