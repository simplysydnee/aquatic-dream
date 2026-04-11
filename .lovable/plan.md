

## Add Weekly Frequency Option to Class Creation

### Current Behavior
When you select multiple days (e.g., Monday + Wednesday) in the Create Classes wizard, it already creates **separate class records** per day. However, the existing sessions use combined `day_of_week` values like `"monday_wednesday"` which means one class meets twice per week.

### What Changes

Add a **Frequency** toggle to the Create Classes dialog:

| Frequency | Example: Tue + Thu selected | `day_of_week` stored | Class dates generated |
|---|---|---|---|
| **2x/week** (current default) | 1 class per level, meets Tue AND Thu | `"tuesday_thursday"` | Both Tue and Thu dates |
| **Weekly** (new) | 2 separate classes per level, one on Tue, one on Thu | `"Tuesday"` / `"Thursday"` | Only that day's dates per class |

### Implementation

**`src/pages/admin/SessionsAdmin.tsx`:**
- Add `frequency: "twice_weekly" | "weekly"` to `createForm` state
- Add a radio/toggle UI between "2x/week" and "Weekly" in the Create Classes dialog
- When **2x/week**: combine selected days into one `day_of_week` string (e.g., `"tuesday_thursday"`), create one class per time slot per level, generate dates for all selected days
- When **weekly**: create one class per day per time slot per level (current behavior), each with its own single-day `day_of_week`, dates generated only for that day

**`src/components/admin/ManageDatesModal.tsx`:** Already handles dynamic day parsing — no changes needed.

**`src/components/admin/calendar/CalendarDayView.tsx` and `CalendarWeekView.tsx`:** Already use `.includes()` matching — works for both formats.

**`src/components/swim-enrollment/SessionPicker.tsx`:** Already works with both formats since it queries by level/age_group, not day_of_week.

**Summary preview in dialog:** Update the class count calculation:
- 2x/week: `time slots × levels × 1` (days are combined)
- Weekly: `time slots × levels × days` (current math)

### Files Modified
- `src/pages/admin/SessionsAdmin.tsx` — add frequency toggle + adjust creation logic

No database changes needed — `day_of_week` is already a flexible text field.

