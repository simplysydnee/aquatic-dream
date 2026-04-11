

## Add Session-Based View to Enrollments Admin

### What It Does
Adds a **tabbed view** to the Enrollments page: the existing "All Enrollments" list plus a new "By Session" view that shows each session as a card with its enrollment count, capacity, and the list of enrolled swimmers.

### Implementation

**`src/pages/admin/SwimEnrollmentsAdmin.tsx`:**

1. Add a `Tabs` component at the top with two tabs: **All Enrollments** (current table) and **By Session**

2. The "By Session" tab groups sessions by session period, then by time slot. Each session card shows:
   - Session name (e.g., "Bubble Makers"), time, days, age group
   - Enrollment count vs max capacity as a progress indicator (e.g., "2 / 3")
   - Color-coded level badge
   - Expandable list of enrolled children with parent name, payment status

3. Add a **session filter dropdown** to the existing "All Enrollments" tab so you can filter the table by a specific session

4. Fetch session period names by joining `session_periods` in the existing query (add `session_period_id` and period name to `SessionInfo`)

### Data Flow
- Already fetching all sessions and enrollments — just need to add `session_period_id`, `max_students`, `day_of_week` to the session query
- Group enrollments client-side by `session_id`
- Group sessions by `session_period_id` for the period headers

### Files Modified
- `src/pages/admin/SwimEnrollmentsAdmin.tsx` — add Tabs, session cards view, session filter

