

## Rename & Restructure: Sessions → Classes

### Terminology Fix
The current naming is backwards. Here's the correction:

| Current (confusing) | New (correct) | Meaning |
|---------------------|---------------|---------|
| "Session Period" | **Session** | Date range (e.g., June 8 – July 1) |
| "Session" / "Swim Session" | **Class** | A group of kids at a specific time/level (e.g., White at 2:45, cap 3) |

### Changes to `SessionsAdmin.tsx`

**1. Rename everything in the UI**
- Page title: "Swim Sessions" → "Sessions & Classes"
- "Session Periods" card → "Sessions" card
- "Add Period" button → "Add Session"
- Period dialog title → "New Session" / "Edit Session"
- "Create Session" button (for classes) → "Create Classes"
- All dialog labels, toasts, and placeholders updated accordingly
- The `session_periods` table stays the same in the DB — only UI labels change

**2. Redesign the "Create Classes" dialog for bulk creation**
Replace the current single-class form with a streamlined flow:
- **Select Session**: Dropdown of sessions (formerly "periods") — e.g., "Session 1 (Jun 8 – Jul 1)"
- **Add Class Times**: Array of start/end time rows with a `+ Add Time Slot` button. Each row has a remove button. Quick way to add many slots.
- **Select Levels**: Checkbox chips (White, Red, Yellow, Blue, Green) — each selected level creates a separate class row with its own capacity
- **Age Group**: Preschool or School-Age dropdown
- **Capacity**: Per class (default 3)
- **Days**: Mon/Wed checkboxes (same as now)
- On submit: creates `timeSlots × levels × days` class rows. E.g., 3 time slots × 2 levels (White + Red) × 1 day-combo = 6 classes
- `session_name` auto-derived from level (White → "Bubble Makers", Red → "Reef Explorers", etc.)

**3. Keep existing class display and inline controls**
- The grouped display (Session → subgroups → time slots) stays the same
- Edit, duplicate, toggle status, assign instructor, manage dates — all unchanged
- Subgroup headers still show "Bubble Makers / Reef Explorers" etc. with age badge

**4. Capacity label fix**
- Change "Max Students (per slot)" → "Max Students (per class)" to clarify that White gets 3 and Red gets 3 separately

### File
`src/pages/admin/SessionsAdmin.tsx` — single file, all changes

### Expected Result
- Owner sees "Sessions" (date ranges) at top, creates them with name + dates
- Below, clicks "Create Classes" → picks a session → adds time slots rapidly → picks levels + age + capacity → bulk creates
- Each level is its own class row in the DB with independent capacity of 3
- Preschool White at 2:45 = one class (3 kids), Preschool Red at 2:45 = another class (3 kids)

