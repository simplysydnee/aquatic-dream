

## Where you can move/edit swimmers today

- **`/admin/enrollments`** → click the eye 👁 icon on any row → opens "Enrollment Details" dialog. You can edit: child name/age/swim level, parent info, notes, status, payment status. **You CANNOT change the class/time here today.** ← gap
- **`/admin/roster`** (Class Roster) → each enrolled swimmer row has a ⇄ "Move Swimmer" button → pick a new session from a dropdown → confirms the move.

So today: edits happen in one place, time/class moves happen in another. Let's unify it.

## Plan: Add "Class & Time" section to Enrollment Details dialog

### What changes
In `EnrollmentDetailDialog.tsx`, add a new section between "Child Information" and "Payment" called **"Class Assignment"** with:

1. **Current class display** — period name · day · time · level · age group (read-only summary line).
2. **Move to a different class** dropdown — same session list used in Class Roster, grouped/labeled as:
   `Session 1 · Mon & Wed · 3:00 PM · Blue (School-Age)`
   - Filter out the current session from the list.
   - Show capacity indicator next to each option (e.g. `2/3` or `FULL`) so admin doesn't move a swimmer into an over-capacity class.
3. **Save** — when saving, if `session_id` changed, update it alongside the other fields in the existing `handleSave`. Show a toast: "Moved Kade to Session 2 · Tue & Thu · 4:00 PM".

### Data needed
- Fetch all `swim_sessions` (active) + `session_periods` once when dialog opens.
- Fetch enrollment counts per session to show capacity (single grouped query).

### UI layout
```text
┌─ Class Assignment ──────────────────────────┐
│ Currently in: Session 1 · Mon & Wed         │
│              3:00 PM · Blue · School-Age    │
│                                             │
│ Move to:  [Select different class    ▾]     │
│           Session 1 · Tue & Thu · 3:00 PM   │
│           Blue · School-Age      (1/3)      │
│           ...                               │
└─────────────────────────────────────────────┘
```

### Files touched
- `src/components/admin/EnrollmentDetailDialog.tsx` — add session/period state, fetch, dropdown UI, include `session_id` in the update payload.

### Out of scope (can do later if you want)
- Bulk-move (select multiple swimmers and move them together).
- Move history audit log.
- Auto-prorate payment if moving across session periods.

