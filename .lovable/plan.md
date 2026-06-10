## Problem
The class roster panel shows "Waiver !" for Arely Carrera even though her waiver page shows "On file · Signed by Lizvett Leon 5/4/2026".

Root cause: two sources of truth are out of sync.
- The roster (`CalendarBlockDetail.tsx` line 530) checks `swim_enrollments.waiver_signed_at`.
- The Waivers admin / swimmer drawer reads from the `enrollment_agreements` table.

Arely's enrollments (and 25 other rows total) have valid `enrollment_agreements` rows signed 5/4/2026, but `swim_enrollments.waiver_signed_at` was never written. This happens for waivers signed inline during the original enrollment flow — only the self-serve token flow (`mark_swim_enrollment_waiver_signed` RPC) and the front-desk dialog backfill the flag.

## Fix (DB-only, no UI changes)

Single migration that:

1. **Backfill** — for every `swim_enrollments` row with `waiver_signed_at IS NULL`, set it to the most-recent `enrollment_agreements.signed_at` where `waiver_accepted = true` (25 rows updated, including both of Arely's enrollments).

2. **Trigger** — `AFTER INSERT OR UPDATE OF signed_at, waiver_accepted ON enrollment_agreements`: when `waiver_accepted = true`, set `swim_enrollments.waiver_signed_at = GREATEST(coalesce(existing, signed_at), NEW.signed_at)` for the referenced enrollment. Keeps the two columns in sync going forward regardless of which signing path is used.

No app code changes; the roster's existing `enr.waiver_signed_at` check becomes correct.

## Verification
After migration:
- `SELECT waiver_signed_at FROM swim_enrollments WHERE child_name ILIKE 'Arely Carrera'` returns non-null.
- Reload the Yellow class panel — "Waiver ✓" badge instead of "Waiver !".
