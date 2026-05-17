## Goal
For first-time enrollments, the registration fee email must include a waiver signing link alongside the $45 payment button. One email, two CTAs.

## Database
- Add to `swim_enrollments`: `waiver_token text unique`, `waiver_signed_at timestamptz`.
- Trigger: auto-generate `waiver_token` on insert when `is_first_time = true` and token is null.
- Backfill tokens for existing first-time enrollments missing one.
- RPC `get_swim_enrollment_by_waiver_token(_token)` (SECURITY DEFINER) returning parent/child/session info needed by the public waiver page.
- RPC `mark_swim_enrollment_waiver_signed(_token)` (SECURITY DEFINER) that stamps `waiver_signed_at` and returns the enrollment id.

## Public waiver page
- New route `/enrollment-waiver/:token` → `src/pages/EnrollmentWaiver.tsx`, modeled on existing `LessonWaiver.tsx`.
- Reuses `LegalAgreements` component, writes a row to `enrollment_agreements` keyed by `enrollment_id`.
- On submit calls `mark_swim_enrollment_waiver_signed`, then shows a confirmation screen with a "Pay $45 registration fee" CTA if `payment_status !== 'paid'` (link to the existing Stripe checkout URL when present).
- If already signed, render a friendly "Waiver already on file" state.

## Email
- `supabase/functions/_shared/transactional-email-templates/registration-fee-payment-link.tsx`:
  - Add an optional `waiverLink` + `waiverSigned` prop.
  - When `waiverLink` is present and not signed, render a prominent "Step 1: Sign your waiver" block above the existing "Step 2: Pay $45 registration fee" button. Copy explains both steps must be completed.
  - When already signed, show a small "✅ Waiver signed" confirmation and only the payment CTA.
- `supabase/functions/send-registration-fee-payment-link/index.ts`:
  - Load `waiver_token` + `waiver_signed_at` from the enrollment.
  - Build `${APP_URL}/enrollment-waiver/${waiver_token}` and pass to template as `waiverLink`.
  - Pass `waiverSigned` boolean.

## Admin UI
- In `PaymentsTab` (and `SwimmerDetailDrawer` where reg fee status shows), add a "Waiver: ✅ signed / ⏳ pending" badge next to the reg fee status.
- Add a "Copy waiver link" button next to the existing "Copy reg fee link" button for first-time enrollments.

## Out of scope
- No change to returning enrollments (they don't get a reg fee email).
- No change to the public 5-step self-serve flow (already collects waivers inline).
- No separate "waiver only" email — single combined email per the chosen approach.

## Files
- Migration (new)
- `src/pages/EnrollmentWaiver.tsx` (new)
- `src/App.tsx` (add route)
- `supabase/functions/_shared/transactional-email-templates/registration-fee-payment-link.tsx`
- `supabase/functions/send-registration-fee-payment-link/index.ts`
- `src/components/admin/PaymentsTab.tsx` (waiver badge + copy link)
- `src/components/admin/SwimmerDetailDrawer.tsx` (waiver badge, if reg fee shown there)