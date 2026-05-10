# Mobile Calendar — Stacked Agenda View

Replace the current horizontal-swipe column grid on mobile with a single vertical, time-ordered list. Each event is a full-width color-coded card (using the existing `BLOCK_COLORS` palette). Desktop/tablet day view stays unchanged.

## Behavior

- Mobile (<768px) day view renders a new `CalendarDayAgenda` layout instead of the multi-column timeline.
- Items are sorted ascending by start time and grouped under hour headers (e.g. "9 AM", "10 AM"). Empty hours are skipped to avoid wasted scroll.
- A "Now" indicator line is inserted between items at the current Pacific time, with auto-scroll to ~1 hour before now on mount (same behavior as today).
- All current behaviors preserved:
  - Tap a card → opens `CalendarBlockDetail` (same `setDetailBlock` handler).
  - Lock icon for ICS items, edit/delete actions for AD events surfaced via the existing detail drawer (no inline action buttons in agenda — same as desktop blocks).
  - Filter bar (`activeFilters`) still hides/shows item types.
  - The "+ Add Event" button in the page header still opens the dialog (no empty-slot tap-to-add on mobile, since there are no empty cells in agenda mode — replaced by a small floating "+" FAB that calls `onAddEvent` with the next quarter-hour).

## Card layout (each row)

```text
┌──────────────────────────────────────────────┐
│ ▎ 9:00 – 9:30 AM            [Yellow • Group] │  ← color bar = BLOCK_COLORS[type].border
│ ▎ Coach Sara · Lane 2                        │
│ ▎ 3 swimmers                                 │
└──────────────────────────────────────────────┘
```

- Left 4px color bar + tinted background = same palette as desktop blocks (ICS blue, AD blue, private purple, semi-private pink, dive amber, rental gray, maintenance gray).
- For AD swim classes, an extra small `LevelBadge` (white/red/yellow/blue/green) shows the level.
- Time range, title, instructor/subtitle, and swimmer count shown inline; no truncation needed since cards are full width.

## What gets stacked

All items already rendered as blocks today are merged into one chronological list:
- ICS sessions (per instructor)
- AD swim classes (one row per session occurrence; swimmer count shown as subtitle)
- Private / semi-private lessons
- Walk-in / pool-rental / dive / maintenance events

## Out of scope

- No data, filter, or business-logic changes.
- No changes to desktop, tablet, or week view.
- No changes to the swimmer detail drawer (already redesigned).

## Files touched

- `src/components/admin/calendar/CalendarDayView.tsx` — branch on `useIsMobile()`: render new agenda JSX instead of the column grid. Reuse existing memoized data (`todayICS`, `todaySessions`, `enrollments`, `adEvents`, `swimLessonEvents`, `diveRentalEvents`) and the `BLOCK_COLORS` map. Build a single `agendaItems` array, sort by start minutes, group by hour, render. Keep the desktop branch exactly as-is.
- (Optional split for readability) `src/components/admin/calendar/CalendarDayAgenda.tsx` — new presentational component receiving the same data, only rendered on mobile.

After implementation I'll verify at 390×844 and confirm desktop is unchanged.
