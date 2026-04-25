## Goal

Bring the Sling experience the owner is used to — a weekly drag-and-drop shift schedule for instructors — directly into the admin app, then layer on the supporting workflows (availability, time-off, trades, labor cost) over a few phases.

## What Sling actually does (the parts worth copying)

1. **Shift schedule** — a weekly grid with employees down the left and days across the top. Click empty cells to add a shift; drag shifts to copy/move; color-coded by position/location.
2. **Templates** — save a week as a template, paste it into any future week.
3. **Availability** — employees mark recurring weekly availability and unavailability; conflicts are flagged when scheduling.
4. **Time-off (PTO) requests** — employee submits, manager approves; approved time-off blocks scheduling on those dates.
5. **Open shifts & shift trades** — manager posts an unassigned shift; eligible employees claim it; employees can offer trades to each other (manager approves).
6. **Publish & notify** — schedule is a draft until "Published"; publishing notifies affected instructors by email.
7. **Time clock** — clock in/out, breaks, timesheets.
8. **Labor cost** — wage × hours, weekly budget, overtime alerts.
9. **Reports** — hours, labor cost, no-shows by employee/period.
10. **Messaging / newsfeed** — internal announcements (you already have an email pipeline; this can stay light).

## What we already have to build on

- `instructors` table (name, email, phone, is_active).
- `swim_sessions` already has `instructor_id` — those recurring lessons are effectively pre-assigned shifts.
- `pool_events` already lets admins block off the pool calendar.
- Admin calendar (`/admin`) renders day/week views with the same date library and styling we'd reuse.
- Auth + RBAC (admin role) and the email-queue pipeline for notifications.

The new module slots in as a sibling page (`/admin/schedule`) and reuses calendar styling, but it stores its own shift records so we can manage state independent of swim sessions.

## Proposed phasing

### Phase 1 — Core weekly shift schedule (MVP)

A new admin page `/admin/schedule` showing a weekly grid: instructors as rows, Mon–Sun as columns. Each cell holds zero or more shift cards.

- Click an empty cell → "Add shift" dialog (start time, end time, position/role, location, notes, color).
- Click a shift card → edit / delete / duplicate.
- Drag a shift to another cell → move it (same instructor, different day, or different instructor).
- Hold modifier + drag → copy.
- "Open shifts" row at the top for unassigned shifts; drag onto an instructor row to assign.
- Week navigator (prev / today / next / date picker) and a "Copy week from…" button (basic templating).
- Draft vs Published state per week; "Publish" sends email to each instructor with their week.
- Auto-pull from `swim_sessions`: the recurring class assignments show up as read-only "class" shifts on the grid, so the owner sees the full picture (lessons + extra shifts) without double-entry.

### Phase 2 — Availability & time-off

- Instructor profile gains weekly recurring availability (preferred / available / unavailable per day-of-week + time range).
- Time-off requests table; instructors submit dates, admin approves/denies.
- Scheduling grid surfaces availability and approved PTO as visual hints and warns when a shift conflicts.

### Phase 3 — Open shifts, claims & trades

- "Open shifts" can be posted publicly to eligible instructors; they receive an email with a claim link.
- First-claim or admin-approval flow (configurable).
- Shift trade: instructor A offers their shift to B; B accepts; admin approves; ownership swaps.

### Phase 4 — Time clock & labor cost

- Per-instructor hourly wage on the `instructors` record.
- Clock-in / clock-out endpoint (kiosk page like the existing check-in, or a per-instructor login).
- Timesheet view per week with edit/approve.
- Schedule grid shows running weekly hours + projected labor cost per instructor and a weekly total vs budget; overtime threshold alert.

### Phase 5 — Reports

- Hours worked, scheduled vs actual, labor cost, no-shows. CSV export.

### Phase 6 — Lightweight messaging

- Per-shift notes already exist; add a simple "announcement" composer that emails a chosen group (all, by location, by role).

## Phase 1 — technical detail

### New database tables

```text
shift_positions          (id, name, color, is_active)
  e.g. "Lesson", "Lifeguard", "Front desk", "Private lesson"

instructor_locations     (optional, can default to one)
  -- skip for now; single-location business

shifts
  id              uuid pk
  instructor_id   uuid null  -- null = open shift
  position_id     uuid null  -> shift_positions
  shift_date      date
  start_time      time
  end_time        time
  notes           text
  color           text null   -- override for one-off
  status          text        -- 'draft' | 'published' | 'cancelled'
  source          text        -- 'manual' | 'swim_session' (synthetic, not stored)
  swim_session_id uuid null   -- when auto-generated, reference back
  created_by      uuid
  created_at, updated_at

schedule_publications
  id, week_start (date, Monday), published_at, published_by
  -- presence of a row = that week is published
```

RLS: admins manage everything; instructors can `select` their own shifts (future phase when they get logins).

### UI

- Page: `src/pages/admin/ScheduleAdmin.tsx`
- Components in `src/components/admin/schedule/`:
  - `ScheduleWeekGrid.tsx` — the grid (rows=instructors + an "Open" row, cols=7 days).
  - `ShiftCard.tsx` — colored chip with time + position; draggable.
  - `ShiftDialog.tsx` — add/edit form.
  - `WeekToolbar.tsx` — nav, Publish, Copy week, filter by position.
  - `PositionsManager.tsx` — small modal to manage `shift_positions`.
- Drag-and-drop with `@dnd-kit/core` (already common in the stack; if not installed we add it).
- Sidebar gets a new "Schedule" entry above "Instructors".

### Sync with swim_sessions

For the visible week we generate synthetic shift cards from `swim_sessions` (joined to `session_lesson_dates`) so each lesson on that date appears in the assigned instructor's row, marked read-only with a "class" badge. They aren't stored in `shifts`; they render alongside.

### Publish flow

"Publish week" inserts a `schedule_publications` row, flips that week's draft shifts to `published`, and enqueues one email per affected instructor with their personal week summary (reusing the existing transactional-email pipeline; new template `instructor-schedule-published.tsx`).

## Open questions before we start

1. Single location or multiple? (assumed single)
2. Should instructors get their own logins in Phase 1 (to view their schedule), or stay admin-only until Phase 2?
3. Do you want the recurring `swim_sessions` lessons auto-shown on the grid, or keep the schedule page purely about extra shifts (lifeguarding, front desk, private lessons)?
4. Phase 1 only this round, or do you want me to scope further?

## Deliverable for this round

Phase 1 only: tables, the weekly grid page with add/edit/move/copy, position management, week templates (copy week), draft → publish with email notification, and the read-only overlay of swim-session lessons (pending answer to Q3).
