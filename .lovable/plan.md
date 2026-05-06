## Goal

Add a "Mark paid" flow with method selection (Cash / Check / Comp / Other) to the **Swim Enrollments admin page**, mirroring what already exists on the Calendar Block detail. Make the **reference number optional** for manual methods on both surfaces. Stripe payments continue to auto-capture the `pi_...` ID via webhook — never typed by an admin.

## Reference number rules (both surfaces)

- **Stripe** → reference auto-set to the Payment Intent ID by the webhook. Admin never enters it.
- **Cash / Check / Comp / Other** → method is required, reference is **optional**. If empty, store `NULL`.

## Database

The existing CHECK constraint on `lesson_booking_occurrences` requires either `pi_...` OR `payment_method + payment_reference` for `paid` rows. To allow optional references for manual payments, relax it to require only `payment_method` (reference optional):

```sql
ALTER TABLE lesson_booking_occurrences
  DROP CONSTRAINT lesson_occ_paid_requires_proof;
ALTER TABLE lesson_booking_occurrences
  ADD CONSTRAINT lesson_occ_paid_requires_proof CHECK (
    payment_status <> 'paid'
    OR (stripe_session_id IS NOT NULL AND stripe_session_id LIKE 'pi_%')
    OR payment_method IS NOT NULL
  );
```

No schema change needed for `swim_enrollments` (no equivalent constraint exists there). `payment_method` and `payment_reference` columns already exist on both tables.

## Changes

### `src/components/admin/calendar/CalendarBlockDetail.tsx`
- Remove the "reference required" guard in `handleMarkPaidConfirm`.
- Update the dialog: keep the reference input but label it "Reference (optional)" — receipt #, check #, or note.
- Allow confirm with empty reference; store `NULL` when blank.

### `src/pages/admin/SwimEnrollmentsAdmin.tsx`
- Add a `MarkPaidDialog` component with: method (`cash` | `check` | `comp` | `other`) and optional reference.
- Title contextualizes the fee: "Registration Fee — $45" or "Session Fee — $240".
- Intercept the dropdowns:
  - Reg Fee dropdown → selecting **Paid** opens the dialog.
  - Session Fee dropdown → selecting **Paid** or **Comp** opens the dialog (Comp pre-selects method=`comp`).
  - All other transitions write immediately as today.
- On confirm, write:
  - Reg fee: `{ payment_status: 'paid', payment_method, payment_reference: ref || null }`
  - Session fee: `{ session_fee_status: 'paid'|'comp', session_fee_paid_at: now, payment_method, payment_reference: ref || null }`
- Update local state and toast.

## Out of scope
- Bulk mark-paid.
- Editing an existing manual payment after the fact.
- Any change to the Stripe webhook path.
