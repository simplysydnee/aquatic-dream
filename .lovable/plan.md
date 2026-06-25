## Goal

Let admins backfill missing DOB on existing swimmer records via inline edit on the Clients drawer. (New enrollment + lesson-request forms already require DOB, so going forward no new NULL rows will be created — no form changes needed.)

Also fix the Flynn Grisby vs Grigsby data issue so he shows up under the same spelling as his sibling.

## Scope of changes

### 1. `src/components/admin/calendar/EditSwimmerDialog.tsx`
- Add a **DOB** field (date picker, same pattern as `LessonRequestForm.tsx`) to the dialog for **both** target kinds (`lesson_booking` and `swim_enrollment`). Currently it shows `Age` only for enrollment and nothing for bookings.
- Pre-fill from a new `child_dob` field on the `EditTarget` type.
- On save, write `child_dob` (ISO `yyyy-MM-dd`) to whichever rows are being updated:
  - `swim_enrollments`: set `child_dob`
  - `lesson_bookings`: set `child_dob`
- DOB stays optional in the dialog (so admins can save other edits without it), but when present it backfills every matching row for that swimmer just like name/email do today.
- When DOB is filled, also auto-populate `child_age` on enrollment rows from the DOB (only when age is currently null) so the two stay consistent.

### 2. `src/components/admin/clients/SwimmerDetailDrawer.tsx`
- The drawer already wires up `EditSwimmerDialog` via the existing "Edit info" affordance. Pass `child_dob` through in the `EditTarget` payload it constructs, and refresh after save (the existing `onSaved` flow already triggers a refetch).
- No layout change — the existing `DOB: —` row will then display the new value after save.

### 3. Data fix — Flynn Grigsby typo
- One-off `UPDATE` on `swim_enrollments` row `98b4fd8c-dd0d-4313-97ec-27268054d644`:
  - `child_name`: `Flynn Grigsby` → `Flynn Grisby`
  - `parent_name`: `Jordynn Grigsby` → `Jordynn Grisby`
- This makes Flynn appear under the same "Grisby" search as Miles.
- **Need confirmation:** is "Grisby" the correct family spelling? (Both sibling rows use it; Flynn's row is the outlier.) If you say so I'll run the update; otherwise the alternative is to correct Miles in the opposite direction.

## Out of scope
- No changes to enrollment or lesson-request forms (they already require DOB).
- No changes to RLS, edge functions, or any schema. `child_dob` columns already exist on `swim_enrollments` and `lesson_bookings`.
- No bulk backfill tool — admins will fill DOB in as they encounter "—" rows in the drawer.
- No change to Clients-page search behavior beyond what the typo fix resolves.