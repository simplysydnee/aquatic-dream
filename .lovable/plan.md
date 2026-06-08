# Waiver prompt at check-in + admin mark-complete fix

## 1. Bug: Admin "Mark waiver complete" doesn't flag swim enrollments as signed

In `supabase/functions/admin-mark-waiver-complete/index.ts`, when `targetType === "lesson_booking"` the function updates `lesson_bookings.waiver_signed_at`. For `targetType === "enrollment"` it inserts the `enrollment_agreements` row but **never updates `swim_enrollments.waiver_signed_at`**. So the Compliance tab and check-in flow still see the swimmer as "not signed" even after an admin marks it complete.

**Fix:** add a parallel update for enrollments:
```ts
if (targetType === "enrollment") {
  await admin
    .from("swim_enrollments")
    .update({ waiver_signed_at: new Date().toISOString() })
    .eq("id", targetId);
}
```

## 2. Check-in: prompt to complete waiver when missing

In `src/pages/admin/CheckInAdmin.tsx`:

- Extend the data fetch to load waiver status per enrollment:
  - Add `waiver_signed_at` to the `swim_enrollments` select.
  - Also fetch `enrollment_agreements` rows for the visible enrollment IDs (covers cases where the agreement exists but the column wasn't stamped — pre-fix legacy rows).
  - Compute `hasWaiver = !!waiver_signed_at || agreementExists`.
- Show a small "Waiver missing" pill on rows without a waiver.
- When the admin clicks **Check in** on a swimmer without a waiver, intercept the action and open a modal:
  - Title: "Waiver required before check-in"
  - Body summarizing parent/child, with three buttons:
    1. **Sign now (in person)** — opens the existing `FrontDeskEnrollmentWaiverDialog` (already used in `CalendarBlockDetail`) prefilled with the enrollment. On success: refresh, then auto-complete the check-in.
    2. **Email waiver link** — calls `send-enrollment-waiver-link` edge function (already exists).
    3. **Check in anyway** — proceeds with the original `setAttendance` call and writes `notes: "checked_in_without_waiver"` so it shows up in reports.
- After the in-person waiver dialog returns success, re-run `fetchData()` then call `setAttendance(...)` to complete the original check-in.

## 3. Out of scope

- Kiosk (`/checkin`) waiver gating — can be a follow-up; this plan covers the admin check-in dashboard only.
- No DB migration; the fix is purely edge function + frontend.

## Files touched

- `supabase/functions/admin-mark-waiver-complete/index.ts` — stamp `swim_enrollments.waiver_signed_at`.
- `src/pages/admin/CheckInAdmin.tsx` — waiver status fetch, missing-waiver pill, intercept modal, integrate existing `FrontDeskEnrollmentWaiverDialog`.
