## Goal
Remove the upper age cap on private/semi-private lesson requests. Replace the "child age" number field with a Date of Birth picker that auto-calculates age. No upper limit — admins decide eligibility when they follow up.

## Changes

### 1. Public Lesson Request Form (`src/components/swim-enrollment/LessonRequestForm.tsx`)
- Replace the "Child's Age" number input with a **Date of Birth** date picker (shadcn DatePicker in a Popover, matching the pattern used in `SwimAssessment.tsx`).
- Auto-calculate age from DOB on submit and on display ("Age: 14" shown beneath the picker so the parent sees what we're recording).
- Update Zod schema:
  - Remove `childAge: z.number().min(3).max(12)`.
  - Add `childDob: z.date()` (required, must be in the past, not more than ~100 years ago).
  - Derive `childAge` from DOB before insert (no min/max enforced).
- Submit payload: send computed `child_age` (integer) and new `child_dob` (ISO date) to `lesson_requests`.

### 2. Database (`lesson_requests` table)
- Add nullable column `child_dob date` via migration so the admin has the exact DOB on file (existing rows stay null).

### 3. Admin Lesson Request Detail Dialog (`src/components/admin/LessonRequestDetailDialog.tsx`)
- Display Date of Birth alongside Age when present.
- (Already has no age restrictions — no other changes needed.)

### 4. Admin "Add Pool Event" / Lesson Booking flow (`AddPoolEventDialog.tsx`)
- The swimmer rows already accept any age (input has `min={1} max={18}` in `AddSwimmerDialog`, but `AddPoolEventDialog` has no validation on age). Bump `AddSwimmerDialog`'s max from 18 to 99 so admins can manually book teens/adults for private lessons too.

## What stays the same
- Group enrollment (`SwimAssessment.tsx`) keeps its 3–12 age range — group classes are still kids-only.
- Pricing, payment flow, RLS policies — unchanged.
- The acknowledgment email and admin notification flow — unchanged (already age-agnostic).

## Files touched
- **Edit**: `src/components/swim-enrollment/LessonRequestForm.tsx` (DOB picker + age calc)
- **Edit**: `src/components/admin/LessonRequestDetailDialog.tsx` (show DOB)
- **Edit**: `src/components/admin/calendar/AddSwimmerDialog.tsx` (raise max age cap)
- **Migration**: add `child_dob date` column to `lesson_requests`
