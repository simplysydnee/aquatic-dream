## Problem

Monday Jun 8 at 8:00–8:30pm there are two semi-private bookings sharing the slot (Sierra Perez and Diego Capistran). Both have their own `pool_event` row, but the day-view grid renders every AD pool event with `absolute left-1 right-1`, so two events at the same time stack directly on top of each other and only the last-painted one is visible. The user sees Sierra, Diego is hidden underneath.

## Fix (frontend only, `src/components/admin/calendar/CalendarDayView.tsx`)

### 1. Compute lanes for overlapping AD pool events
Add an `adEventLanes` memo (mirroring the existing `sessionLanes` sweep-line logic) keyed by `pool_event.id`, producing `{ lane, laneCount }` for every event in `adEvents` (so private, semi-private, and walk-in pool events all share lane assignment in the single AD column).

### 2. Teach `renderBlock` about lanes
Add two optional params `lane?: number` and `laneCount?: number`. When `laneCount > 1`, replace the hard-coded `left-1 right-1` with inline `left` / `width` based on the lane index (e.g. `calc((100% - 4px) / laneCount * lane + 2px)` and a matching width), keeping a small 2px gap. When `laneCount` is 1 or undefined, behavior is unchanged.

### 3. Pass lanes from the AD event map
In the `adEvents.map(...)` render at ~line 1038, look up `adEventLanes.get(e.id)` and pass `lane` / `laneCount` into `renderBlock`. No changes needed for swim-lesson or dive/rental sections (they already have their own column treatment).

### 4. (Tiny consistency) The same lane logic also applies to `walkInEvents` since they're folded into `adEvents` — they'll automatically benefit because everything goes through the shared `adEventLanes` map.

No backend, RLS, or data changes. No edits to PrivateLessonsPanel, detail dialog, or print sheet.

## Verification

- Open Calendar → Mon Jun 8 → confirm two side-by-side blocks at 8:00pm, one labeled "Semi-Private Lesson — Sierra Perez" and one "Semi-Private Lesson — Diego Capistran".
- Confirm non-overlapping AD blocks at other times still render full-width (lane logic only kicks in when `laneCount > 1`).
- Confirm walk-in pool events that overlap with a private lesson at the same time also display side-by-side rather than hidden.
