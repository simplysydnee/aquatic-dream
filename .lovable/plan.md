## Goal
In the admin Enrollment Detail dialog, the Registration Fee field is locked to "N/A" whenever `is_first_time = false`. After manually confirming a returning-swimmer enrollment (e.g., Ramanpreety Kaur), there's no way to mark a reg fee as paid. Make this field an editable dropdown in all cases.

## Change
File: `src/components/admin/EnrollmentDetailDialog.tsx` (lines ~346–363)

Replace the `is_first_time ? <Select/> : <p>N/A</p>` conditional with a single always-rendered `<Select>` for `payment_status`, with options:

- Unpaid
- Paid
- Refunded
- Waived
- N/A (returning) → value `not_required`
- Comp → value `comp`
- Flagged (no pay) → value `flagged_no_pay`

Label stays "Registration Fee" with the `$45` / `N/A — returning` hint based on `is_first_time` (unchanged copy). No change to `handleSave` — it already persists `payment_status`.

Keep the existing "Send $45 Registration Fee Payment Link" button gated on `is_first_time && payment_status === "unpaid"` (unchanged).

## Out of scope
- No DB / edge function changes.
- No change to Session Fee dropdown or any other field.
- No change to how new enrollments default `payment_status` (webhook + trigger logic untouched).
