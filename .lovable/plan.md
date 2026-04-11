

## Changes to Enrollment Form

### Summary
Three changes: (1) replace age input with date of birth, calculating age automatically, (2) add medical/allergy conditional question, (3) add `child_dob` and `medical_notes` columns to the database.

### Database Migration
Add two columns to `swim_enrollments`:
- `child_dob` (date, nullable) — child's date of birth
- `medical_notes` (text, nullable) — medical conditions/allergies description

### Assessment (`SwimAssessment.tsx`)
- Replace the age number input with a **date of birth** date picker (simple `<Input type="date">`)
- Calculate age from DOB automatically
- Validate age is 3-12
- Pass both `age` and `dob` string to `onComplete`

### Enrollment Form (`EnrollmentForm.tsx`)
- Remove the disabled "Child's Age" field (age is already captured in assessment)
- Add a new section: **"Does your child have any medical conditions or allergies we should know about?"** with Yes/No radio buttons
- If "Yes" is selected, show a textarea for details (required if yes)
- Add `medicalNotes` to the form schema (required when hasMedical is "yes")
- Phone remains optional (already is)

### Parent Page (`SwimEnrollment.tsx`)
- Update `onComplete` signature to receive `dob` string
- Store `childDob` in state, pass to DB insert
- Pass `medicalNotes` from enrollment form data to DB insert
- Show DOB and calculated age on confirmation

### Files Modified
1. **Migration** — add `child_dob` and `medical_notes` columns
2. `src/components/swim-enrollment/SwimAssessment.tsx` — DOB input instead of age
3. `src/components/swim-enrollment/EnrollmentForm.tsx` — add medical/allergy question, remove age display
4. `src/pages/SwimEnrollment.tsx` — wire DOB and medical notes through to DB
5. `src/components/swim-enrollment/types.ts` — update interfaces if needed

