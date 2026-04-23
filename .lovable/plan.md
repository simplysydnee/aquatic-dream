

## Fix the Status dropdown on Enrollments admin

The Status column shows blank/odd values because the dropdown only offers `enrolled` + `cancelled`, but every row in the DB is stored as `confirmed`. Fix dropdown options, normalize data, and clarify the column.

### 1. Normalize Status dropdown options

In `src/pages/admin/SwimEnrollmentsAdmin.tsx` (line ~479), replace the dropdown options with the canonical set:

- **Confirmed** (`confirmed`) — default for paid/active enrollments
- **Waitlist** (`waitlist`) — full class, awaiting spot
- **No-show** (`no_show`) — registered but didn't attend
- **Cancelled** (`cancelled`) — withdrawn / refunded

Each option gets a colored badge (green / amber / gray / red) so the state is obvious at a glance instead of plain text in a select.

### 2. Rename column header

Change `Status` → **`Enrollment State`** so it's visually distinct from the adjacent `Payment` column. Update the matching tab/filter labels for consistency.

### 3. Update `isActive` logic

Line 190 currently treats both `confirmed` and `enrolled` as active. After the backfill, simplify to just `confirmed` (drops the legacy alias). `waitlist` and `no_show` are NOT counted as active for capacity / revenue math.

### 4. Backfill data

One-time data update via the insert tool:
- `UPDATE swim_enrollments SET status='confirmed' WHERE status='enrolled'`
- Verify no other stray values exist; if found, map them or leave with a console warning

### 5. Memory

Add to `mem://features/admin-enrollments`: canonical status values are `confirmed | waitlist | no_show | cancelled`. Never use `enrolled` (legacy alias).

### Files touched

- `src/pages/admin/SwimEnrollmentsAdmin.tsx` — dropdown options, header rename, `isActive` simplification, badge styling
- DB: one `UPDATE` to normalize legacy `enrolled` rows
- `mem://features/admin-enrollments` — record canonical status set

### Not doing

- ❌ No schema migration (status is free-text, no enum to alter)
- ❌ No changes to payment status logic (separate concern, already correct)
- ❌ No changes to enrollment creation paths (they already write `confirmed`)

