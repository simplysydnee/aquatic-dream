

## Fix Session Dates + Add Session Periods Table

### Current State

The database has no dedicated "session periods" table. Session dates are stored directly on each `swim_sessions` row. Current values:

| Age Group | Session 1 Dates | Session 2 Dates |
|-----------|----------------|----------------|
| School-age | Jun 6 – Jun 29 (WRONG) | Jul 13 – Aug 5 (WRONG) |
| Preschool | Jun 8 – Jul 1 (correct) | Jul 13 – Aug 2 (correct) |

**Correct dates per owner:**
- Session 1: **June 8 – July 1** (both age groups)
- Session 2: **July 13 – August 2** (both age groups)

### What's Changing

**1. Fix existing session dates (data update)**
- Update all school-age Session 1 rows: `session_start_date` → `2025-06-08`, `session_end_date` → `2025-07-01`
- Update all school-age Session 2 rows: `session_end_date` → `2025-08-02`
- Regenerate `session_lesson_dates` for affected sessions if needed

**2. Create a `session_periods` table (new table)**
- Columns: `id`, `name` (e.g. "Session 1"), `start_date`, `end_date`, `is_active`, `created_at`
- Seed with two rows: Session 1 (Jun 8 – Jul 1) and Session 2 (Jul 13 – Aug 2)
- Add RLS: public can read, authenticated can manage

**3. Link `swim_sessions` to `session_periods`**
- Add `session_period_id` column to `swim_sessions` (nullable UUID)
- Backfill existing rows based on their `session_start_date`
- The roster and booking pages will derive period labels from this relationship instead of guessing from dates

**4. Build a simple "Manage Session Periods" UI in the admin**
- Add a section (or separate admin page) where the owner can create/edit session periods (name, start date, end date)
- When creating a new session period, the system can optionally bulk-create all the standard time slots automatically

**5. Update ClassRosterAdmin.tsx**
- Use `session_period_id` to group cards by period instead of the tolerance-based date logic
- Period label comes from the `session_periods` table name field

**6. Update SessionPicker.tsx (booking)**
- Filter available sessions by active session periods
- Display period name to parents during enrollment

### Files Affected

| Action | Target |
|--------|--------|
| DB migration | Create `session_periods` table, add `session_period_id` to `swim_sessions` |
| DB data update | Fix school-age dates, backfill `session_period_id`, seed period rows |
| Modify | `src/pages/admin/SessionsAdmin.tsx` — add period management UI |
| Modify | `src/pages/admin/ClassRosterAdmin.tsx` — group by period via FK |
| Modify | `src/components/swim-enrollment/SessionPicker.tsx` — filter by active period |
| Update | `session_lesson_dates` — regenerate for corrected date ranges |

### Expected Result
- Owner can create/edit session periods from the admin
- All session rows link to a period, eliminating date-guessing bugs
- Roster and booking dynamically reflect the correct period groupings
- Session 1: June 8 – July 1, Session 2: July 13 – August 2

