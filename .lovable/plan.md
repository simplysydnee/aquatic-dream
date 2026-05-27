## Goal
In the swim enrollment detail dialog (admin), add a button to email the parent a $45 registration-fee payment link — mirroring the existing $240 session-fee link button.

## Change
File: `src/components/admin/EnrollmentDetailDialog.tsx`

1. Add a second handler `handleSendRegFeeLink` that invokes the existing `send-registration-fee-payment-link` edge function (already used by `admin-create-enrollment`), passing `{ enrollmentId, environment: "live" }`. Use a separate `sendingRegLink` state so the two buttons don't share a spinner.
2. In the Payment section, render a new button under the grid (next to / above the existing session-fee button) when `form.is_first_time && form.payment_status === "unpaid"`:
   - Label: "Send $45 Registration Fee Payment Link" (Sending… while in flight)
   - Same outline/sm/full-width styling and `Send` icon as the session-fee button
3. On success: toast "Registration fee link sent! Email sent to {parent_email}". On error: destructive toast with the error message.

No backend changes — the `send-registration-fee-payment-link` function already exists and is wired through Stripe.

## Out of scope
- No change to the session-fee button.
- No change to the edge function or payment-flow rules.