## 1. Front-desk pool waiver: in-dialog success screen

**Problem:** After the signer submits the front-desk waiver, the dialog closes and drops them on the Waivers admin list — exposing other clients' info.

**Change:** Keep the dialog open after signing and show an admin-only success view inside it. Admin clicks "Done" to close.

**Files**
- `src/components/admin/waivers/FrontDeskVisitorWaiverDialog.tsx`
  - Add local `signed` state.
  - Pass `hideSuccessScreen` to `VisitorWaiverForm` and use the form's `onSubmitted` to flip `signed = true` instead of immediately calling parent `onSigned`.
  - When `signed`, render a centered success card: green check, "Waiver received — please return the device to the front desk", and a "Done" button. Clicking "Done" resets state, calls parent `onSigned()` (which closes + refetches in `WaiversAdmin`).
  - Prevent accidental dismiss while in `signed` state is fine; admin uses Done.

No changes to `VisitorWaiverForm` or backend.

## 2. Calendar: camera icon on classes where every swimmer has photo consent

**Problem:** Admins need an at-a-glance signal of which groups can be photographed.

**Logic:** A class card shows a camera icon when the class has ≥1 enrollment AND every enrollment in that class has a matching `enrollment_agreements` row with `photo_release_accepted = true`. If any swimmer is missing consent (or has no agreement on file), no icon.

**Files**
- `src/components/admin/calendar/CalendarDayView.tsx`
  - In the `showAD` swim-session loop (around line 397), compute `allPhotoOk` by checking that every `sessionEnrollments[i]` has an agreement in `agreements` with `photo_release_accepted === true` (keyed by `enrollment_id`).
  - Add a new optional field (e.g. `photoOk: boolean`) on the calendar item and pass it through.
- Wherever calendar items are rendered (same file, item card JSX), render a small `Camera` lucide icon next to the title when `photoOk` is true. Title tooltip: "All swimmers have photo consent".
- Mirror the same icon in `CalendarWeekView.tsx` group rendering if it surfaces the same items.

No DB changes — `enrollment_agreements` is already loaded in `useCalendarData`.

## Out of scope
- Per-swimmer indicators inside the class detail (already shown in `ComplianceTab` / detail dialog).
- Marketing/photo-release rules beyond the existing `photo_release_accepted` boolean.
