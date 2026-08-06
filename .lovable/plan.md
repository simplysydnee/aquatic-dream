# Fix: parents stuck at "Please complete all fields" on /join

## What parents are hitting

Julia Tejeda (Alfredo, Mon 6:30pm) and at least one other family reached the Review screen, saw "Waiver: Signed today", tapped "Continue to secure payment", and got the toast "Please complete all fields" with no payment fields ever appearing. There is no way to recover inside the flow, so the hold link is a dead end for them.

## Confirmed root cause

The waiver resolver has two ways to say a waiver is on file:

- A `visitor_waivers` row match, which returns a waiver id.
- A family-wide fallback (`swimmer_has_waiver_on_file`) that also counts waivers signed inside an old summer enrollment or private booking. This path returns `onFile: true` with `waiverId: null` by design, because no visitor waiver row exists.

On /join, when `onFile` is true the waiver step is skipped and `waiverId` is set to whatever came back, which for the fallback is null. The final gate then requires a non-null `waiverId`, so it blocks. The Review row also reads as "Signed today" because both the on-file flags are empty.

Verified in the database: Alfredo Tejeda has a summer `swim_enrollments` row with a signed waiver, and zero `visitor_waivers` rows. That is exactly the fallback case.

Anyone who swam this summer and signed inside the enrollment flow, but never signed a standalone visitor waiver, hits this. That is a large share of the 93 families the announcement links went to.

## The fix

1. When the resolver reports a waiver on file without an id, write a visitor waiver record for that swimmer at that moment (reusing the existing backfill helper) and use the returned id. This both unblocks the parent and repairs the missing record permanently.
2. If that write fails for any reason, do not skip the waiver step. Send the parent to the normal waiver screen instead of a dead end.
3. Make the final gate never trap the parent: if any required piece is missing, jump back to the step that owns it with a specific message instead of a generic "Please complete all fields".
4. Correct the Review row so a waiver carried over from an existing record reads "On file" rather than "Signed today".

## Follow-up for the affected families

- Reach out to Julia Tejeda (Alfredo, Monday 6:30pm) and the Imaan family once the fix is live so they can finish on the same link. Their holds stay valid.

## Technical notes

- `src/pages/JoinMembership.tsx`: `handleInfoContinue` waiver branch, `handleFinalize` gate, Review waiver row.
- `src/lib/swimmerWaiver.ts`: reuse `backfillVisitorWaiver`, returning the inserted id so callers can adopt it.
- No database migration and no changes to holds, checkout, or Stripe.
