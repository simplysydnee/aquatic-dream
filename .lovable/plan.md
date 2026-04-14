

## Add "Swim Lesson" Event Type to Calendar

### Purpose
Allow admins to manually schedule swim lessons for existing/transitioning clients directly from the calendar's "New Event" dialog. Supports adding swimmers immediately or leaving the lesson open, with flexible recurrence options.

### How It Works

When "Swim Lesson" is selected in the New Event dialog, additional fields appear:

1. **Swim Level** dropdown — White, Red, Yellow, Blue, Green (shows group name, e.g. "Yellow — Sea Scouts")
2. **Max Students** — defaults to 3
3. **Recurrence toggle** — off by default; when on, shows:
   - Frequency: Weekly / Biweekly
   - Days of week: checkboxes (Mon, Tue, Wed, etc.)
   - End date picker
4. **Add Swimmers section** — collapsible, optional
   - Quick-add form: child name, age, parent name, email, phone
   - "Add Another" button to queue multiple swimmers
   - Can skip entirely (add swimmers later from the calendar block)

### What Happens on Save

- **Single lesson**: Creates a `pool_event` with `event_type: "swim-lesson"` so it shows on the calendar. Also creates a corresponding `swim_session` record linked to the selected date/time/level.
- **Recurring lesson**: Creates multiple `pool_event` rows for each occurrence based on the recurrence rule, plus one `swim_session` record that covers the full date range.
- **Swimmers** (if added): Creates `swim_enrollment` records linked to the new `swim_session`, with `status: "confirmed"`.

### Display on Calendar

Swim Lesson blocks will appear with the swim-level color badge and group name (e.g. "Sea Scouts · 1/3"), similar to existing swim session blocks. Clicking opens the existing class block detail with roster and check-in functionality.

### Files Modified

1. **`src/components/admin/calendar/AddPoolEventDialog.tsx`** — Add "Swim Lesson" chip, conditionally render swim-level selector, recurrence options, and inline swimmer-add form
2. **`src/components/admin/calendar/CalendarFilterBar.tsx`** — Add "swim-lesson" to activity types if not already covered by "swim"
3. **`src/components/admin/calendar/CalendarDayView.tsx`** — Render swim-lesson pool events with level-colored blocks
4. **`src/hooks/useCalendarData.ts`** — No changes needed (already fetches pool_events and swim_sessions)

### Technical Details

- Recurrence generation is done client-side: iterate from start date to end date, filter by selected days of week and frequency, create one `pool_event` per occurrence
- The `swim_session` record uses `day_of_week` matching the recurrence pattern (e.g. "monday_wednesday") for compatibility with existing roster/attendance logic
- Swimmer additions reuse the same insert logic as `AddSwimmerDialog`

