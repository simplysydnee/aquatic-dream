# Calendar improvements + roster split + print-day-schedule

Four changes, all scoped to the admin calendar and class roster.

## 1. Grey out closed classes on the calendar

In `useCalendarData.ts`, fetch `registration_status` on `swim_sessions` (column already exists, default `'open'`). Keep filtering `is_active`, but no longer hide classes where `registration_status = 'closed'` from the day view.

In `CalendarDayView.tsx`, when rendering a session block whose `registration_status === 'closed'`:
- replace the level-colored background with a muted grey (`bg-muted/60`, `border-muted-foreground/30`)
- desaturate text (`text-muted-foreground`)
- add a small "Closed" pill in the top-right of the block

No change to underlying data or behavior — purely visual.

## 2. Show class capacity at a glance on the calendar

Today the day view block shows `White / Little Fins`. Add a second line:

```text
White
Little Fins
2/3
```

- Compute `enrolled_count` per `session_id` from the already-fetched `enrollments` array (status in `pending|confirmed|enrolled|pending_payment`).
- Render `enrolled/max_students` in the bottom-right of the block.
- When `enrolled >= max_students`, render it as a red "FULL" pill; otherwise muted text.

No new fetches — uses the data already in `useCalendarData`.

## 3. Split same-time/level duplicate groups on Class Roster

`ClassRosterAdmin.tsx` currently groups by `session_name|start_time|age_group|session_period_id`. Two Little Fins Mon&Wed 3:15–3:45 sessions collapse into one card even though they are two separate classes (different `session_id` / instructor).

Change the grouping key to also include `instructor_id` (and as a final tiebreaker, `session_id`) so each scheduled class card is rendered separately, matching the Enrollments page behavior.

Card header keeps the same look but appends the instructor name (already shown elsewhere) so admins can tell the two cards apart at a glance.

## 4. Print Daily Schedule (per instructor) from the calendar

Add a "Print schedule" button to `CalendarAdmin.tsx` header (next to "Add Event"). Opens a small dialog:

- Date — defaults to the currently selected day, editable
- Instructor — dropdown of instructors who have classes that day, plus "All instructors"
- Print button

On Print, open a new tab with a print-optimized HTML page rendered from existing in-memory data (no new edge function needed). The page lists, for the chosen instructor and day, each class in time order with:

- Time, level pill, age group, session name
- Capacity `enrolled/max`
- Roster table per class:
  - Child name, age, level
  - Parent name, parent phone, parent email
  - Emergency contact name + phone
  - Medical notes (if any)

Layout: clean letter-size print stylesheet, Aquatic Dreams header with logo, level color stripe per class section, generous line height, page-breaks between instructors when "All" is chosen. Calls `window.print()` on load.

### Data sources
- Classes + enrollments: already in `useCalendarData` for the selected day.
- Emergency contact fields: query `swim_enrollments` columns `emergency_contact_*` (already present on the table) at print time, scoped to the day's enrollment ids. Add these columns to the existing enrollment select in `useCalendarData` so the print page can use the cached data without an extra round-trip.

## Files to touch

- `src/hooks/useCalendarData.ts` — add `registration_status`, emergency contact fields, do not exclude closed
- `src/components/admin/calendar/CalendarDayView.tsx` — grey-out closed, capacity pill
- `src/pages/admin/CalendarAdmin.tsx` — "Print schedule" button + dialog
- `src/components/admin/calendar/PrintDayScheduleDialog.tsx` *(new)* — instructor/date picker, opens print window
- `src/pages/admin/PrintDaySchedule.tsx` *(new)* — print-formatted route, reads params from URL, fetches data, auto-prints
- `src/App.tsx` — route for `/admin/print-day-schedule`
- `src/pages/admin/ClassRosterAdmin.tsx` — include `instructor_id` (+ `session_id`) in grouping key, show instructor on card

## Out of scope
- No DB migrations.
- No changes to enrollment, payment, or email flows.
- Week view styling for closed classes can be a follow-up if you want it; this plan covers the day view where the issue is visible.
