

## Reframe Enrollment dashboard to seat utilization

Replace the misleading "7 / 64" headline (active classes / total classes) with a real **seats booked vs seats open** metric, scoped to the session period the admin is looking at.

### What changes on the card

Headline becomes:

```
24 / 192 seats booked
168 spots open  ·  13% full
```

- **Booked** = count of `swim_enrollments` with `status = 'confirmed'` whose `session_id` falls in the selected period
- **Total seats** = sum of `max_students` across all `swim_sessions` in the selected period (each class is 3 max)
- **Open** = total − booked
- **% full** = booked ÷ total

A thin progress bar underneath visualizes fill rate. Color shifts: gray <50%, teal 50–85%, coral >85%.

### Scope selector

Add a small period picker on the card (defaults to the **next upcoming session period**, matching the logic already in `SessionEnrollmentCards.tsx`):

- Next upcoming session (default)
- Specific session period (Session 1, Session 2, …)
- All sessions combined

Selection only affects this card — the table below keeps its own filters.

### Demote the old stat

"Classes started: 7 / 64" moves into the small footer line next to *Cancelled / Refunded / Waived* as a secondary diagnostic, since "how many classes have at least one swimmer" is still useful but isn't the headline.

### Layout

```text
┌─────────────────────────────────────────────┐
│ Seats Booked          [Session 2 ▼]         │
│                                             │
│   24 / 192          168 open · 13% full     │
│   ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░            │
│                                             │
│ Classes active 7/64 · Cancelled 1 · …       │
└─────────────────────────────────────────────┘
```

### Files touched

- `src/pages/admin/SwimEnrollmentsAdmin.tsx` — replace headline math, add period selector state, add progress bar + color thresholds, demote classes-started to footer
- No DB migration, no edge function changes

### Not doing

- ❌ No change to the "By Session" tab below (already shows per-class fill correctly)
- ❌ No change to payment / revenue stats
- ❌ No new tables or columns — all data already in `swim_sessions.max_students` + `swim_enrollments.status`

