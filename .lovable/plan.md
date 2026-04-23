

## Fix Seats Booked card UI

The progress bar currently looks like a giant dark navy banner across the card — it's too thick, too dark, and visually overwhelms the actual numbers. Issues:

1. Color override (`[&>div]:bg-…`) doesn't reliably win against Radix Progress's built-in `bg-primary` indicator → fill renders as solid navy regardless of %.
2. At 4% full, the tiny filled sliver is invisible while the empty track (which is also styled) reads as one big colored bar.
3. The bar sits flush against the number and the "open · % full" text wraps awkwardly.

### Redesign

Replace the Radix `<Progress>` with a simple custom div-based bar we fully control:

```text
┌────────────────────────────────────────────┐
│ Seats Booked              [Upcoming ▼]     │
│                                            │
│ 6 / 192   ·   186 open   ·   4% full       │
│                                            │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← thin 6px, soft slate track
│ ▓                                          │  ← coral/teal fill, rounded
│                                            │
│ Upcoming session                           │
└────────────────────────────────────────────┘
```

Specifics:
- **Bar**: `h-1.5` (6px), `bg-slate-200/60` track, rounded-full, fill is a positioned inner div with width `${pct}%`, min-width 4px when pct>0 so a tiny % is still visible.
- **Fill color**: keep the existing thresholds but use direct Tailwind classes (`bg-slate-400` <50, `bg-[hsl(var(--teal))]` 50–85, `bg-[hsl(var(--coral))]` >85) on the inner div — no `[&>div]:` selector hacks.
- **Layout reorder**: number → inline summary on one line (`6 / 192 · 186 open · 4% full`) → bar → period label. Removes the awkward `<br />` and the bar-jammed-against-number look.
- **Zero-state**: when `totalSeats === 0`, hide the bar, show "No sessions in this period" instead of "0 / 0 · 0% full".

### Files

- `src/pages/admin/SwimEnrollmentsAdmin.tsx` — replace lines ~362–372 (CardContent of Seats Booked card), drop `seatsBarColor` Radix-selector variable, add a small inline bar component or inline JSX.

### Not doing

- ❌ No change to math, period selector, or footer diagnostics
- ❌ No new dependencies

