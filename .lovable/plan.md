## 1. Email template (`/mnt/documents/june-lesson-email.html`)

No changes — the rebranded version stays as-is. Nothing will be sent automatically; the file is just a draft you'll forward manually. When you do send it, exclude any contacts flagged as adult swimmers (see #2).

## 2. Adult-swimmer flag on lesson requests

**Schema migration** — add column to `public.lesson_requests`:
- `is_adult_swimmer boolean not null default false`

**Auto-flag existing rows** during the migration when any of these are true:
- `child_age >= 16`
- `lower(notes)` or `lower(child_name)` contains `adult`, `myself`, `for me`, `i want`, or `im an adult`

**Admin UI** — `src/pages/admin/LessonRequestsAdmin.tsx` + `LessonRequestDetailDialog.tsx`:
- New "Adult swimmer" badge on request rows (amber pill) when `is_adult_swimmer = true`
- Toggle in the detail dialog to mark/unmark adult swimmer
- New filter chip in the page header: **All / Kids only / Adults only** (defaults to **Kids only** so the list you'd email from naturally excludes adults)
- Badge count in `useAdminBadgeCounts` continues to count all "new" requests (unchanged)

No outreach/email-sending code is added — this is purely a flag + filter so you can hand-pick recipients.

## 3. Recurring slot quick-picks (`src/components/private-lessons/SlotPicker.tsx`)

Current bugs:
- `weeklyOptions.slice(0, 12)` caps the list at 12, which is why you only see Sophia's 6 (cap hides others further down)
- With "Any available instructor" selected, options end up sorted by insertion order, so the first instructor dominates the visible 12

Fixes:
- Remove the 12-cap; show every recurring pattern with ≥2 dates
- Group quick-picks by instructor with a small instructor sub-heading so all instructors are visible
- Sort within each instructor by day-of-week, then time
- Keep the existing day/time filter chips functional (they already filter `weeklyOptions`)
- Cap each instructor at 20 patterns max as a sanity guard (still way more than 6)

## Technical notes

- Migration uses `ALTER TABLE` + `UPDATE` for the backfill heuristic; no new tables or RLS changes needed (existing admin policies cover the new column)
- `src/integrations/supabase/types.ts` will regenerate automatically after the migration
- No edge functions, no email infrastructure changes