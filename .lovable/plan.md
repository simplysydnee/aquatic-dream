

# Pool Calendar Day View — Redesign Options

## What You Described

A vertical timeline where each time slot is a full-width color-coded row showing the activity type and the names of people in that slot inline, like:

```text
3:00 PM  [■ amber] I Can Swim — Lauren, Sutton, Megan
3:00 PM  [■ blue ] Level 2 Swim — Jake, Emma
3:30 PM  [■ pink ] Private Lesson — Riley
4:00 PM  [■ green] Dive Session — Open
```

Here are three layout approaches to choose from:

---

### Option A — Color Bar Rows (Compact Schedule Board)

Each time slot is a horizontal row. Activities within that slot are color-coded bars that span the row, with names listed inline.

```text
 TIME        ACTIVITY
 ─────────────────────────────────────────────────────
 3:00 PM   ┃ ██ I Can Swim 209    Lauren · Sutton · Megan
           ┃ ██ Level 2 Lessons   Jake · Emma (2/6)
 3:30 PM   ┃ ██ Private Lesson    Riley
 4:00 PM   ┃ ██ Dive Session      —
 4:30 PM   ┃ ██ Maintenance       (Full Pool)
```

- Single column, stacked vertically
- Each activity is a colored pill/bar with the label and names on one line
- Most compact — good if you want a quick glance at the whole day
- Clicking a row expands it to show check-in checkboxes

---

### Option B — Time Blocks with Lanes (Pool Area Columns)

Vertical timeline on the left, with two columns: Shallow End and Deep End. Activities slot into their pool area.

```text
 TIME       SHALLOW END                    DEEP END
 ─────────────────────────────────────────────────────
 3:00 PM    ██ I Can Swim 209              ██ Dive Session
            Lauren · Sutton · Megan         Open
 3:30 PM    ██ Private Lesson              —
            Riley
 4:00 PM              ██ Maintenance (Full Pool)
```

- Shows pool area usage at a glance — you can see conflicts
- Activities span both columns when "full pool"
- More visual but takes more space

---

### Option C — Gantt-Style Time Blocks (Visual Duration)

Vertical time axis with blocks that visually represent duration (taller = longer). Color-coded with names inside.

```text
 3:00 ┃ ┌──────────────────────┐  ┌─────────────────┐
      ┃ │ I Can Swim 209       │  │ Level 2 Lessons  │
      ┃ │ Lauren·Sutton·Megan  │  │ Jake · Emma      │
 3:30 ┃ ├──────────────────────┤  └─────────────────┘
      ┃ │ (continues)          │
 4:00 ┃ └──────────────────────┘
```

- Most visual — block height reflects actual duration
- Good for seeing overlaps and gaps
- More complex to build, takes more vertical space

---

## Recommendation

**Option A** is closest to what you described — clean vertical list, color-coded bars, names inline. It is the simplest to build and easiest to scan. Check-in can expand on click.

## Implementation (whichever option you pick)

- Rewrite `CalendarDayView.tsx` with the new layout
- Keep all existing functionality (check-in, edit/delete events, attendance)
- Color coding stays the same (amber = I Can Swim, blue = swim lessons, pink = private, etc.)
- Clicking a row expands to show checkboxes for attendance

Pick **A**, **B**, or **C** (or mix elements) and I will build it.

