

# Pool Calendar Redesign — Google Calendar-Style Day View

## Summary

A major redesign of CalendarDayView to match the reference screenshots: a Google Calendar-style columnar layout with continuous vertical time axis, dynamic I Can Swim instructor columns from Airtable, grouped column headers, activity filter chips, block detail panels, empty slot interaction, and an inline mini calendar.

## What Does NOT Change
- I Can Swim sync button and Airtable integration
- Color key bar (already exists)
- Supabase as database
- AddPoolEventDialog flows
- Week navigation and day tabs
- Brand colors (#0A1628, #2A9D8F, #C9A96E)

## Layout

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  KEY  ● I Can Swim  ● Swim lesson  ● Private  ● Semi  ● Dive  ● Pool │
├─────────────────────────────────────────────────────────────────────────┤
│  [+ Add lesson] [+ Dive] [+ Private/semi] [+ Pool rental] [Export]    │
├─────────────────────────────────────────────────────────────────────────┤
│  ‹  📅 Friday, April 10 2026 ▼  ›   Today                            │
│     ┌──────────────────────┐  (inline mini calendar when open)        │
│     │  April 2026          │                                          │
│     │  Su Mo Tu We ...     │                                          │
│     └──────────────────────┘                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  ● Sun 6  ● Mon 7  ● Tue 8  ● Wed 9  ● Thu 10  ● Fri 11  ● Sat 12  │
├─────────────────────────────────────────────────────────────────────────┤
│  FILTER: [I Can Swim] [Swim] [Private] [Semi] [Dive] [Rental] [All]  │
│  Showing: I Can Swim 209, Swim lesson, Private lesson                 │
├─────────────────────────────────────────────────────────────────────────┤
│        │ I Can Swim 209 — 3 instructors │ Aquatic Dreams │ Dive/Rental│
│        │  ICS 1    ICS 2    ICS 3       │  AD Line 1     │            │
│────────┼────────┬────────┬──────────────┼────────────────┼────────────│
│ 8 am   │        │        │              │                │            │
│ - - - -│- - - - │- - - - │- - - - - - - │ - - - - - - -  │ - - - - -  │
│ 9 am   │ ██████ │ ██████ │  ██████      │                │            │
│        │ Maria  │ Priya  │  Devon       │                │            │
│        │ Adapt. │ Adapt. │  Adapt.      │                │            │
│        │ 4 swim │ 3 swim │  4 swimmers  │                │            │
│ - - - -│- - - - │- - - - │- - - - - - - │ - - - - - - -  │ - - - - -  │
│ 10 am  │ ██████ │        │              │ ██████████████ │            │
│        │ Maria  │        │              │ Level 2        │            │
│        │ Adapt. │        │              │ Jake · Emma    │            │
│        │ 3 swim │        │              │ (2/6)          │            │
│────────┼────────┴────────┴──────────────┼────────────────┼────────────│
│ 11 am  │                                │                │ ██████████ │
│        │                                │                │ Pool Rental│
│        │                                │                │ Modesto    │
│        │                                │                │ Marlins    │
└────────┴────────────────────────────────┴────────────────┴────────────┘
```

## Implementation Details

### 1. Block positioning (continuous time axis)
- Define constants: `HOUR_HEIGHT = 80px`, `START_HOUR = 7`, `END_HOUR = 20`
- Each block's `top` = `(startMinutes - START_HOUR*60) * HOUR_HEIGHT/60`
- Each block's `height` = `durationMinutes * HOUR_HEIGHT/60`
- Render horizontal lines: solid at each hour, dashed at :30
- Blocks use `position: absolute` within a `position: relative` column container

### 2. Dynamic I Can Swim columns
- The edge function already returns sessions with `instructor_name`
- On day view load, call the I Can Swim edge function and filter sessions to the current date
- Extract unique instructor names for that day — these become columns (min 1, max 5)
- Each column header shows the instructor's name (e.g., "Maria R.")

### 3. Group header row
- Three spanning headers above the instructor/line columns:
  - "I Can Swim 209 — X instructors today" (bg: #E1F5EE, text: #085041)
  - "Aquatic Dreams — X lines" (bg: #E6F1FB, text: #0C447C)
  - "Dive / Rental" (bg: #FAEEDA, text: #633806)
- Aquatic Dreams lines: determined by swim_sessions + pool_events that are not I Can Swim or dive/rental

### 4. Activity filter bar
- Row of colored chips below the key, one per type
- Chip colors per the spec table (e.g., I Can Swim: bg #E1F5EE, text #085041)
- Toggling off dims blocks to `opacity: 0.12` — does not remove them
- "Show all" reset button
- When any filter inactive, show "Showing: [active type names]"

### 5. Block click → roster panel
- I Can Swim blocks: show lock icon, not clickable
- Aquatic Dreams blocks: click opens a slide-over panel (right side) with:
  - Title + line/date subtitle
  - Time tile + Instructor tile
  - Roster list (initials avatar, name, age/cert, session #)
  - "Edit", "Add swimmer", "Cancel session" buttons
  - Edit opens existing AddPoolEventDialog
  - Closes on X or outside click

### 6. Empty slot interaction
- Aquatic Dreams and Dive/Rental columns: on hover over empty space, show faint "+ add" at that position
- Click opens AddPoolEventDialog pre-filled with the column's line context and the clicked time

### 7. Mini calendar on date button
- Replace the Popover with an inline collapsible panel below the date button
- Shows month calendar with activity dots on days that have events
- Click a date → navigate + collapse
- Click date button again → collapse

### Files Changed

| File | Change |
|------|--------|
| `CalendarAdmin.tsx` | Add filter state, inline mini calendar toggle, week day tabs, action buttons row, integrate I Can Swim edge function data |
| `CalendarDayView.tsx` | Full rewrite: columnar layout with continuous time axis, dynamic columns, group headers, block positioning, click handlers, empty slot hover |
| `useCalendarData.ts` | Add I Can Swim Airtable session fetching for the current day (call edge function) |
| New: `CalendarBlockDetail.tsx` | Roster detail panel component (slide-over) |
| New: `CalendarFilterBar.tsx` | Activity filter chips component |

### Edge function
No changes to `i-can-swim-schedule/index.ts` — it already returns instructor names and session times. We just need to call it from the day view and filter to the selected date.

