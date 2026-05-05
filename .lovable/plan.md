## Calendar UX fixes

Three small fixes to `src/components/admin/calendar/CalendarDayView.tsx`.

### 1. Clicking an event opens "Add Event" instead of the detail panel

Each column has an `onClick` handler that calls `handleEmptySlotClick` → `onAddEvent`. The AD swim-session block stops propagation, but the blocks rendered through `renderBlock` (pool events, swim-lesson events, dive/rental events, ICS sessions) do **not** — so clicking them bubbles up to the column and opens AddPoolEventDialog on top of the detail panel.

Fix: in `renderBlock`, wrap the existing `onClick` so it calls `e.stopPropagation()` before invoking the handler. Also stop propagation on the inner Edit / Delete buttons' parent div (already done individually, fine) and on the action buttons themselves (already done).

### 2. No hover preview for events

Add a lightweight tooltip on every block showing key info without having to click.

- Wrap each block in `Tooltip` / `TooltipTrigger` / `TooltipContent` from `@/components/ui/tooltip` (already in project).
- Tooltip content per block type:
  - **ICS**: client/session type, instructor, time range, status, capacity (`confirmed_bookings/max_capacity`).
  - **AD swim session**: level name, session name, time, instructor, swimmer count + first 3 swimmer names.
  - **Pool event (private/semi-private/swim-lesson/dive/rental)**: title, time, instructor, pool area, notes.
- Ensure a `TooltipProvider` wraps the day view (add at the root of `CalendarDayView` return if not already provided globally).
- `delayDuration={150}` so it appears quickly but doesn't flicker on pass-through.

### 3. Private/semi-private lessons counted as "events" in the AD header

The header counts `adEvents.length` (which includes `private-lesson` and `semi-private-lesson` rows from `pool_events`) as generic "events". Re-bucket so lessons are labelled correctly:

- Split `adEvents` into:
  - `lessonEvents` → `event_type` in `["private-lesson", "semi-private-lesson"]`
  - `walkInEvents` → everything else currently in `adEvents`
- Header chips become:
  - `{N} class(es)` (existing, from `todaySessions`)
  - `{N} swimmer(s)` (existing)
  - `{N} lesson(s)` when `lessonEvents.length > 0` (new)
  - `{N} event(s)` only when `walkInEvents.length > 0` (existing label, narrower scope)
- Rendering of the blocks themselves stays unchanged (still in the AD column, with their existing colors).

### Files touched

- `src/components/admin/calendar/CalendarDayView.tsx` — only file changed.

No DB / edge-function changes.