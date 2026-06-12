## Goal

Make editing a single private lesson as fast as editing a Google Calendar event: open the lesson → change date, start time, end time, and instructor inline → save. No need to pre-create a booking block at that time.

The backend (`reschedule-private-lesson-occurrence`, `mode: "one"`) already accepts free-form date/start/end/instructor and only blocks real conflicts (pool area + overlapping lesson on same instructor). The DB double-book trigger also protects us. So this is a UI-only change plus one optional drag handler.

## What changes

### 1. New `QuickEditLessonDialog` component
`src/components/admin/booking/QuickEditLessonDialog.tsx`

- Inputs: Date picker, Start time `<input type="time">`, End time `<input type="time">` (auto-fills to start + current length when start changes), Instructor `<Select>` from `get_active_instructors_public`, "Notify parent" checkbox (default checked), optional reason.
- Shows "Currently: …" summary at top.
- Save → calls `reschedule-private-lesson-occurrence` with `mode: "one"`, free-form values, `notify` flag, `reason`.
- On 409 conflict response, surfaces the server message inline (e.g. "Instructor already has another lesson overlapping…").

### 2. Wire it into the 3 admin entry points

- **Calendar event click** — `PrivateLessonDetailDialog`: replace the current Reschedule button (which opens the slot-picker dialog) with a primary "Edit" button that opens `QuickEditLessonDialog`. Keep an "Advanced (move series / change all remaining)" link that opens the existing `ReschedulePrivateLessonDialog`.
- **Private Lessons admin per-occurrence row** — `PrivateLessonsAdmin.tsx` (line ~979): replace the per-occurrence reschedule action with the quick-edit dialog. Keep "Reschedule remaining" as-is.
- **Calendar Private Lessons panel** — `PrivateLessonsPanel.tsx`: same swap on the per-lesson Reschedule button.

### 3. Drag-to-move on calendar
- In the admin calendar private-lesson tile, make the tile draggable (HTML5 drag-and-drop) within the day column. On drop into a different time row, open `QuickEditLessonDialog` pre-filled with the new start time (and end = start + length). Admin still has to click Save, so it acts as a confirmation step and prevents accidental moves. Cross-day drag is out of scope for this iteration.

### 4. Backend touch-ups (minor)
- `reschedule-private-lesson-occurrence` already supports everything we need. Add `reason` to the email template payload (already present). No schema changes.
- Confirm the conflict messages are user-friendly; no other changes.

### Out of scope
- Editing series-level fields (price, child, parent) — already handled elsewhere.
- Drag across days/instructors.
- Public-facing self-serve reschedule.
- Existing Reet/Carson/Armani cleanup (per your prior instruction, leave data as is).

## Technical notes

- The existing `validateSlot` only checks pool conflicts and instructor overlap, so any time inside the pool's operating hours is allowed even if no booking block exists at that time. This matches your "Lesley wants 12:30" case where no 12:30 block exists.
- The DB trigger `prevent_lesson_occurrence_double_book` still backs us up if two admins try to edit simultaneously.
- "Notify parent" defaults on; when off, no email is sent (already supported via `notify: false`).
- Drag-and-drop will be plain HTML5 (`draggable`, `onDragStart`, `onDrop` on a time-row grid). No new libs.