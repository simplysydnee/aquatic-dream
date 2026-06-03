## Goal

Make the printed daily schedule (`/admin/print-day-schedule`) fit one instructor per page (front, with overflow to back if needed) so each laminated sheet sits at the pool deck for that instructor's shift.

## Issues in current print

Looking at the PDF you sent:
- Each instructor spans 2–3 pages because cards have heavy chrome (borders, badges, two-line headers, per-class tables with thead repeated).
- Browser headers/footers ("6/3/26, 1:40 PM ... lovableproject.com ... 4/10") eat ~1 inch top + bottom.
- The "Unassigned" instructor with 0/3 empty classes still gets a full page.
- Tables repeat column headers for every class; column widths waste space.

## New layout (one page per instructor)

```text
┌─────────────────────────────────────────────────────────────┐
│ GRACE CAVANAUGH                       Mon · Jun 8, 2026     │
│ 6 classes · 8 swimmers                Aquatic Dreams Swim   │
├─────────────────────────────────────────────────────────────┤
│ TIME       │ CLASS              │ SWIMMER (age)  │ PARENT  │ EMERGENCY │ NOTES │
│ 2:45–3:15  │ ■ Red · Reef Expl. │ Kaira Kang (5) │ Amanda  │ Gursharan │       │
│   2/3      │ Preschool 3–5      │ Leilani G. (5) │ Imani   │ Jorge G.  │       │
│ ───────────┼────────────────────┼────────────────┼─────────┼───────────┼───────│
│ 3:45–4:15  │ ■ Red · Reef Expl. │ Anahi M. (4)   │ Blanca  │ Maria R.  │       │
│   1/3      │                    │                │         │           │       │
│ ...                                                                              │
├─────────────────────────────────────────────────────────────┤
│ Printed Jun 3, 2026 · Page 1 of 1                                                │
└─────────────────────────────────────────────────────────────┘
```

Single dense table per instructor, one header row at top, color stripe per class on the time column, rows grouped visually by class (top row of each class shows time + level + capacity badge with row-span; following rows just show swimmer info).

### Density rules
- Body font 9pt (down from 11pt)
- Row padding 3px (down from 6px)
- Drop email column from the table; keep parent first name + phone instead (email is rarely needed pool-side)
- Drop separate "Age Group" line; tuck into the class cell
- Emergency contact = name + phone only; relationship in parens
- Medical notes stay in their own column, bold red when present

### Page rules
- `@page { size: letter portrait; margin: 0.4in }` (browser headers/footers still appear by default; add an on-screen tip telling staff to toggle them off in the print dialog — "More settings → Headers and footers → off")
- `.instructor-page { page-break-before: always }` (first one no break)
- If one instructor overflows to a 2nd page, the table header repeats via `<thead>` so the back of the sheet is still readable
- Hide instructors with zero classes for the day (so "Unassigned" with empty classes doesn't waste a page); still show Unassigned if it has at least one class with enrollments OR keep an admin toggle (default: hide empty)

### Header band per instructor
- Big name (18pt) left, day + date right
- One-line summary under name: `N classes · M swimmers · pool: <ranges if available>`

### Single-instructor mode
When `?instructor=<id>` is set (not "all"), behaves identically — just one page (or 2 if overflow). No leading page break.

## Files to change

- `src/pages/admin/PrintDaySchedule.tsx` — replace the card layout with the dense per-instructor table, update CSS for forced page breaks, drop empty instructors, repeat thead on overflow.

No DB or other component changes needed. The "Print Schedule" dialog and route stay the same.

## Out of scope

- Removing the browser's auto-printed URL/timestamp header (browsers control this; we'll show a one-line on-screen tip)
- Landscape orientation (portrait fits the pool-deck laminate format you already use)
- Per-class instructor-overrides via `session_lesson_dates.instructor_override_id` (currently not surfaced; can be added later if you use overrides regularly)
