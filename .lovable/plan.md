# Delete test private bookings

Remove the three test bookings created on Jun 29 via the self-serve flow using denise Chacon's email.

## Rows to remove

| Booking ID | Child name | Date / Time |
|---|---|---|
| `8d2a87e7-439b-43d9-b565-34a0f5c69ef6` | DoubleKid Tester | Tue Jul 14, 3:00 PM |
| `26c564e0-cd1a-44ea-8833-0a4f651aafca` | ReuseEvKid ev_d3f23860 | Tue Jul 14, 5:30 PM |
| `2d3b66f5-26e9-4cd3-b93e-916c11d3c3ab` | ReuseKid Tester | Wed Jul 8, 8:00 PM |

## Steps

1. Pre-check: query `lesson_booking_occurrences` for these three `booking_id`s and confirm none have `stripe_payment_intent_id` set (i.e. no real Stripe charge). If any do, stop and report before deleting.
2. Delete matching rows from `lesson_booking_occurrences` (child rows first).
3. Delete the three rows from `lesson_bookings`.
4. Verify with a follow-up SELECT that the Tuesday Jul 14 private-lessons panel no longer lists them.

## Technical notes

- Uses the `insert` tool (DELETE is a data operation, not a schema change).
- Denise Chacon's real bookings (Adrian, Julian Chacon) are not touched — they have different booking IDs.
- No Stripe refund needed; these were card-on-file setups, not paid charges.
