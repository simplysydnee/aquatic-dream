
## Problem

We store waivers in several places (`visitor_waivers`, `enrollment_agreements`, `lesson_bookings.waiver_signed_at`, `swim_enrollments.waiver_signed_at`), but the UI is inconsistent about which one it trusts:

- **Check-In pages** (`CheckInAdmin`, `KioskCheckIn`) call the RPCs `enrollments_waiver_status` / `bookings_waiver_status`, which internally run `swimmer_has_waiver_on_file` (last name + DOB match, with email/phone fallback). These correctly show "on file" even when the specific enrollment row has `waiver_signed_at = NULL`.
- **Calendar, Swimmer drawer, Enrollment dialog, Payment link dialog, Private lesson dialog, Compliance tab, Session block card, Payments tab** all read the raw `waiver_signed_at` column on the individual enrollment/booking row. If that specific row is null (which it is for many re-enrollments — e.g. Olive Dompeling's newest enrollment has null DOB/name and null `waiver_signed_at`, but her lesson bookings under the same email have signed waivers), these UIs incorrectly say "Not signed".

`useCalendarData` already tries to patch this via `get_active_waiver_signed_at_for_swimmer`, but that RPC requires `first + last + dob` — it does nothing when the enrollment row is missing any of those fields (Olive's case).

Per the spec: **one signed waiver per swimmer covers everything for 1 year**. We should never show "no waiver" if the family already has one on file.

## Fix

Centralize the truth in the two data hooks that feed every affected UI, plus one Compliance-tab detail. Everything downstream keeps reading `waiver_signed_at`, so no widescale UI churn is needed.

### 1. `src/hooks/useCalendarData.ts`

Replace the current strict per-swimmer enrichment (lines ~217–259) with a batched call to the existing RPCs that already implement the correct rules (last+dob primary, email/phone fallback, plus first-name tie-breaking):

- After fetching enrollments, call `enrollments_waiver_status(_ids => enrollmentIds)` in one round-trip. For each row where `has_waiver = true` and `waiver_signed_at` is null, set `waiver_signed_at` to a sentinel timestamp (`new Date().toISOString()` — this column is only ever tested for truthiness in downstream UI).
- Do the same for bookings via `bookings_waiver_status(_ids => bookingIds)`; set the derived `waiver_signed_at` on the flattened `PrivateLessonBooking` records built from occurrences (around line 323).

This fixes: `CalendarBlockDetail` (both group enrollments and lesson-booking cards), `PrivateLessonDetailDialog`, and every other calendar-driven waiver badge.

### 2. `src/hooks/useSwimmers.ts`

After the parallel fetch of enrollments and bookings (around line 233), add the same two batched RPC calls, then overwrite `waiver_signed_at` on each `SwimmerEnrollment` / `SwimmerBooking` when `has_waiver` is true but the raw value is null.

This fixes: Clients drawer, `PaymentsTab` (waiver link + "Email reg fee + waiver" label + `SendPaymentLinkDialog` `includeWaiver` prefill), `EnrollmentDetailDialog` (the row is passed in from the same data path), and any other consumer of `useSwimmers`.

### 3. `src/components/admin/swimmer/tabs/ComplianceTab.tsx`

The header "Waiver / On file vs Not signed" badge currently only counts `enrollment_agreements` rows plus per-booking `waiver_signed_at` — it never considers a matching `visitor_waivers` row from a sibling record.

- On load, also call `swimmer_has_waiver_on_file(first, last, dob, email, phone)` once for the swimmer (using name split + DOB from `swimmer` + parent email/phone as fallback). If true, force the header badge to "On file" and, in the per-record list, replace the "Mark complete" button with a muted "Covered by waiver on file" note for rows where `waiver_signed_at` is still null on the raw record. The "Mark complete" flow stays available via a small "Override / attach agreement" link so admin can still record a per-record agreement when they want to.

Latest agreement details (signer, photo release, emergency contact) still come from `enrollment_agreements` as today; they're only shown when a record-level agreement exists, so no change needed there.

### 4. No schema changes, no edge-function changes

The RPCs `enrollments_waiver_status`, `bookings_waiver_status`, and `swimmer_has_waiver_on_file` already exist and already implement the correct 1-year, sibling-safe, uniqueness-gated matching. This plan just wires the existing UIs to use them consistently.

## Verification

1. Load `/admin/calendar` on a day with Olive Dompeling → enrollment card shows "Waiver ✓".
2. Open Clients → Olive → Compliance tab shows "Waiver: On file" header and no red "Not signed" chips on her enrollments.
3. Open her enrollment in `EnrollmentDetailDialog` and confirm the "Send payment link" preselect for waiver-include is OFF (because waiver is on file).
4. Check-In page unchanged (already correct).
5. Spot-check a swimmer with genuinely no waiver anywhere → still shows "Not signed" everywhere.

## Technical details

- Sentinel timestamp approach preserves the existing `waiver_signed_at ? … : …` conditionals throughout the codebase without needing to add a new `has_waiver_on_file` prop to a dozen components.
- Both RPCs are already `SECURITY DEFINER` with `stable` search paths and RLS-safe; batching by array of IDs is one round-trip each.
- The Compliance tab is the only place that actually needs to distinguish "record-level agreement exists" from "family-wide waiver covers this" — everywhere else the distinction doesn't matter to the user.
