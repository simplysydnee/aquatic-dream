

## Fix Payment Timing by Enrollment Type

### Current behavior
All swimmers (first-time and returning) go through Stripe checkout for the full amount (session fees + registration fee if applicable).

### Correct behavior
- **First-time swimmers**: Pay only the $45 registration fee at signup via Stripe. Session fees are due on or before the first day (deferred). Confirmation shows "Session fees due on [first class date]."
- **Returning swimmers**: Pay session fees immediately via Stripe checkout. No registration fee.

### Changes

**`src/pages/SwimEnrollment.tsx`**
1. In `getCheckoutPriceIds()`: If first-time, return only `["registration_fee"]`. If returning, return `["swim_session_fee"]` × number of sessions (no registration fee).
2. In `handleLegalSubmit()`: Update `payment_amount` on enrollment records to reflect what's actually being charged now vs deferred.
3. For first-time enrollments, set `payment_status: "unpaid"` for session fees and mark enrollment records accordingly so the admin knows session fees are still owed.

**`src/components/swim-enrollment/EnrollmentConfirmation.tsx`**
1. If first-time: show "Registration fee paid: $45" and "Session fees due on [first class date]: $X".
2. If returning: show "Payment Complete" with session fee total.

**`mem://features/payment-flow`** — Update to reflect correct logic.

### Technical details
- First-time checkout creates a Stripe session with one line item: `registration_fee`
- Returning checkout creates a Stripe session with N line items: `swim_session_fee` × session count
- Enrollment records store `payment_amount` as the full eventual total, but `payment_status` distinguishes what's been paid
- No database migration needed — just logic changes in two files

