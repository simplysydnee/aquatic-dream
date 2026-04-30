# Make Enrollment Status More Prominent

On `/admin/enrollments`, the **Enrollment State** dropdown (Confirmed / Waitlist / No-show / Cancelled) currently sits to the right of all the payment columns, so it's the second-to-last thing on the row. It should be the first thing you see after the parent/session info, since status drives most admin decisions.

## Change

Reorder the columns on the **All Enrollments** table from:

```text
Child | Age | Level | Parent | Session | Reg Fee | Session Fee | Method/Ref | Enrollment State | Date | (actions)
```

to:

```text
Child | Age | Level | Parent | Session | Enrollment State | Reg Fee | Session Fee | Method/Ref | Date | (actions)
```

Same change applied in matching order on the new **Cancelled** tab table so both views stay consistent.

## Visual emphasis

To make the status pop (not just move it), I'll also:
- Bump the trigger height from `h-8` to `h-9` and widen slightly so the colored pill reads cleanly.
- Keep the existing color coding (green/amber/slate/red) — that's the main signal.

No other tabs, filters, metrics, or business logic change.

## Files

- `src/pages/admin/SwimEnrollmentsAdmin.tsx` — reorder `<TableHead>` and `<TableCell>` in both the All Enrollments table and the Cancelled table.
