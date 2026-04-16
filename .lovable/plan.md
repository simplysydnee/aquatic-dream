

## Enrollment Flow Audit — Findings & Fixes

### Issues Found

**1. Double enrollment not prevented — status mismatch**
The `swim_enrollments` table defaults `status` to `'enrolled'`, but both the SessionPicker capacity check (line 103) and the pre-insert capacity check (line 102 in SwimEnrollment.tsx) filter on `status IN ('pending', 'confirmed')`. The insert itself sets `status: "confirmed"`. So the capacity counting works for new enrollments, but any enrollment created with the default `'enrolled'` status would be invisible to capacity checks. This is inconsistent — the default should match what the code uses.

Additionally, there's **no unique constraint** preventing the same child from enrolling in the same session twice. A fast double-click or browser back could create duplicate rows.

**2. Photo consent — Toggle vs Yes/No**
Currently uses a `Switch` toggle (defaults to OFF). The user wants explicit "Yes" or "No" radio buttons instead of a toggle, making the choice more intentional and clear.

**3. Payment is LIVE**
All 4 go-live steps are completed. Live checkout is ready. The `.env.production` file should have a `pk_live_` token. No action needed here.

### Plan

**A. Prevent double enrollment (2 changes)**

1. **Database migration**: Add a unique index on `(session_id, child_name, parent_email)` where `status IN ('confirmed', 'enrolled', 'pending')` to prevent duplicate enrollments at the DB level.

2. **Client-side guard**: After the insert succeeds, disable the submit button and prevent re-submission. Already partially handled by `submitting` state, but add a check that `enrollmentIds` is empty before allowing submission.

3. **Fix status default**: Update the DB default from `'enrolled'` to `'confirmed'` to match what the code inserts, OR update the capacity queries to also include `'enrolled'`. The simpler fix is updating the capacity queries to include all active statuses: `['pending', 'confirmed', 'enrolled']`.

**B. Photo consent — Switch to Yes/No radio buttons**

Replace the `Switch` component with a `RadioGroup` with explicit "Yes" and "No" options. Default to no selection (force an explicit choice). Add validation requiring a selection.

**C. No payment changes needed**

Stripe is fully live. No action required.

### Files modified
- `src/components/swim-enrollment/LegalAgreements.tsx` — replace photo release Switch with RadioGroup
- `src/pages/SwimEnrollment.tsx` — fix capacity query to include `'enrolled'` status, add double-submit guard
- `src/components/swim-enrollment/SessionPicker.tsx` — fix capacity query to include `'enrolled'` status
- Database migration — add partial unique index to prevent duplicate enrollments

