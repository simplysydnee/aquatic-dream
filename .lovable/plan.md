## Goals

Two related cleanups so admins can manage a Saturday like Zoey's in one place:

1. **One-time "Move swimmer to another class for this date"** — launched from the class card on the calendar day view. Original enrollment stays intact; the swimmer just shows on the destination roster for that single date.
2. **Render private/semi-private lesson occurrences directly in the calendar grid** (currently they sit in `PrivateLessonsPanel` below the grid). One cohesive view on `/admin/calendar` and `/admin/private-lessons`.

---

## Part 1 — One-time swimmer move (group classes)

### Data model
New table `public.enrollment_date_moves`:

```
id              uuid pk
enrollment_id   uuid  → swim_enrollments(id) on delete cascade
lesson_date     date  not null
target_session_id uuid → swim_sessions(id) not null
reason          text  null
created_by      uuid  null
created_at      timestamptz default now()
unique (enrollment_id, lesson_date)
```

Plus required GRANTs + RLS:
- `authenticated` + `service_role`: full access through admin role policy
- `has_role(auth.uid(), 'admin')` policies for select/insert/update/delete

### Backend wiring
- `useCalendarData` already loads `enrollments` and `lessonDates` for the visible range. Add a parallel fetch of `enrollment_date_moves` for the same range, and expose `enrollmentDateMoves` on the hook.
- In `CalendarDayView`, when grouping enrollments per session for the selected day:
  - Remove enrollments whose move's `target_session_id` ≠ original `session_id` (they're moved out of the origin class today).
  - Add enrollments that have a move pointing to this session for this date (they're moved in).
  - Tag visiting swimmers with a small "Moved from {origin instructor}" badge so admins see the context.

### UI
On the class card / day-modal roster, add a labeled **"Move for this date"** button (not just the tiny ⇄ icon) per swimmer.

The dialog reuses `MoveSwimmerDialog`-style picker but in **one-date mode**:
- Heading: "Move {child} — {date} only"
- Destination select: today's eligible sessions (same day_of_week, has a non-cancelled `session_lesson_dates` row for that date, has capacity after accounting for moves).
- Action writes/updates the `enrollment_date_moves` row.
- Includes a **"Remove move"** button when one already exists for that date.

### Out of scope for Part 1
- Permanent moves keep using existing `MoveSwimmerDialog`.
- Attendance rows for moved swimmers continue to use their original enrollment id; the destination class roster just shows them on that date.

---

## Part 2 — Private lessons on the calendar grid

### Source of truth
`privateLessons: PrivateLessonBooking[]` from `useCalendarData` (already filtered to the visible range and excludes cancelled).

### Render in `CalendarDayView`
- Build `privateLessonEvents` adapter that maps each `PrivateLessonBooking` for `dateStr` to the same shape used for AD pool events (start_time, end_time, instructor_name, lane assignment), tagged with `event_type: "private-lesson" | "semi-private-lesson"`.
- Include them in the existing AD lane-assignment pipeline so they slot in with `lessonEvents` (which today only renders legacy `pool_events`-based lessons).
- Color: same `EEEDFE/26215C` private and `FBEAF0/4B1528` semi-private tokens already in `EVENT_COLORS`.
- Click action: open `PrivateLessonDetailDialog` (the same dialog used by `PrivateLessonsPanel`). Hoist the dialog state so it can be triggered from the grid card too.
- Show pending-card warning badge inside the grid card (mirror the amber chip already added to the panel).

### PrivateLessonsPanel
- Keep it for the "Open slots" list (still useful), but drop the "Booked lessons" cards — the grid replaces them. Update the header from `"Private Lessons"` to `"Open Private Slots"` for the day.

### `/admin/private-lessons`
- The Schedule tab there already has its own custom grid; no change.
- The Bookings tab unchanged.
- The CalendarAdmin page is where the cohesive grid lives. Confirm `/admin/private-lessons` still meets the user's mental model after the panel is trimmed; if they expected the calendar grid on `/admin/private-lessons` too, that's a separate follow-up — current plan focuses on `/admin/calendar`.

### Filter respect
- Honor `activeFilters` for `private-lesson` and `semi-private-lesson` exactly as legacy lesson events do.

---

## Technical notes
- `enrollment_date_moves` is a real schema change (Part 1); will need a migration with grants + RLS.
- No edge function changes required for either part.
- All edits stay in: `useCalendarData.ts`, `CalendarDayView.tsx`, `MoveSwimmerDialog.tsx` (or a new `MoveSwimmerOneDateDialog.tsx`), `PrivateLessonsPanel.tsx`, `CalendarAdmin.tsx`.
- Capacity check in one-date move respects max_students minus (existing enrollments + moves in − moves out for that date).

## Order of work
1. Migration for `enrollment_date_moves` + RLS/GRANTs.
2. Hook + roster recompute (Part 1 backend).
3. One-date Move dialog + button on the class card (Part 1 UI).
4. Private lesson grid rendering + trim panel (Part 2).
