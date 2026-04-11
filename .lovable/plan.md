

## Payment-Gated Enrollment with First-Session Grace Period

### Understanding the Flow

There are two distinct paths:

| | **First-Time Swimmer** | **Returning Swimmer** |
|---|---|---|
| **At enrollment** | Completes form → enrolled, no payment yet | Must pay session fee to complete enrollment |
| **Payment due** | First day of lessons (reg fee $45 + session fee) | At enrollment time (session fee only) |
| **Reminder** | Day before first lesson — email with Stripe pay link | N/A (already paid) |
| **Confirmation** | Shows enrollment confirmed, payment due on first day | Shows confirmation only after payment |

### Database Changes

**Add columns to `swim_enrollments`:**
- `payment_status` — `unpaid`, `paid`, `refunded` (default: `unpaid`)
- `payment_amount` — total amount paid
- `stripe_payment_id` — Stripe reference for reconciliation
- `is_first_time` — boolean, whether this was their first enrollment (used for reporting)
- `payment_due_date` — date payment is due (first lesson date for new swimmers)
- `payment_reminder_sent_at` — timestamp when reminder email was sent

**Returning swimmer detection:** Query `swim_enrollments` by `parent_email` where `payment_status = 'paid'` to check if any prior paid enrollment exists.

### Stripe Integration

Enable Stripe via the Lovable Stripe tool. This creates the infrastructure for payment links and checkout sessions.

**Edge function: `create-swim-checkout`**
- Receives: enrollment data (or enrollment ID for returning swimmers)
- Checks if returning swimmer (has prior paid enrollment by parent_email)
- First-time: calculates reg fee ($45) + session fee
- Returning: session fee only
- Creates Stripe Checkout Session → returns URL

**Edge function: `handle-swim-payment`**
- Stripe webhook for `checkout.session.completed`
- Updates `swim_enrollments.payment_status` to `paid`
- Stores Stripe payment ID and amount

### Reminder Email (Day Before First Lesson)

- Set up a scheduled edge function or pg_cron job that runs daily
- Queries enrollments where `payment_status = 'unpaid'` and first lesson date is tomorrow
- Sends reminder email with Stripe payment link to each parent
- Records `payment_reminder_sent_at`

This requires email infrastructure setup (email domain + transactional email scaffolding).

### Enrollment Flow Changes

**First-time swimmer (`SwimEnrollment.tsx`):**
1. Assessment → Session → Details → Legal → **Confirmation page** (no payment step)
2. Confirmation says: "You're enrolled! Payment of $[reg + session fee] is due on your first lesson day. You'll receive a reminder email with a payment link."
3. Enrollment inserted with `status: 'enrolled'`, `payment_status: 'unpaid'`

**Returning swimmer (`SwimEnrollment.tsx`):**
1. Assessment → Session → Details → Legal → **Stripe Checkout redirect**
2. After payment → redirect to confirmation page showing "Paid & enrolled"
3. Enrollment only inserted after successful payment (via webhook)

### Admin Enrollments Page Updates

**`SwimEnrollmentsAdmin.tsx`:**
- Replace pending/confirmed/cancelled status cards with: `Enrolled (Unpaid)`, `Paid`, `Cancelled`
- Add payment status column showing paid/unpaid with amount
- Add "Send Payment Link" button per row — generates Stripe link and emails parent
- Add "Mark as Paid" for cash/check payments (manual override)
- Add filters: payment status, swim level, session, text search

### Implementation Order

1. Enable Stripe (collects your Stripe secret key)
2. Database migration — add payment columns
3. Create `create-swim-checkout` edge function
4. Create `handle-swim-payment` webhook edge function
5. Update `SwimEnrollment.tsx` — split flow for first-time vs returning
6. Update confirmation page — show payment info
7. Set up email domain + transactional email for payment reminders
8. Create daily reminder cron job
9. Update `SwimEnrollmentsAdmin.tsx` — payment tracking, send link, mark paid
10. Update `EnrollmentDetailDialog.tsx` — payment details tab

### Files to Create/Modify

- `supabase/functions/create-swim-checkout/index.ts` (new)
- `supabase/functions/handle-swim-payment/index.ts` (new)
- `supabase/functions/send-payment-reminders/index.ts` (new)
- `src/pages/SwimEnrollment.tsx`
- `src/pages/EnrollmentSuccess.tsx` (new — Stripe return page)
- `src/pages/admin/SwimEnrollmentsAdmin.tsx`
- `src/components/admin/EnrollmentDetailDialog.tsx`
- `src/components/swim-enrollment/EnrollmentConfirmation.tsx`
- Database migration for payment columns

### Prerequisites

- Stripe secret key (will be requested when enabling Stripe)
- Email domain setup (for payment reminder emails)

