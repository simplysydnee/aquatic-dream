# Armani's stale "pending" and the payment-problem filter you cannot clear

## What I found on Armani

Armani Eshaq is **not** pending as a membership. The membership row is real and complete:

- Status `active`, Private Swim, parent Ana Paula Jimenez, start date Aug 22
- Stripe subscription attached (`sub_1U4q...`), waiver on file, standing slot assigned
- Created Aug 15, 10:49 PM

What is stale is the **phone hold** behind it. The hold created Aug 14 for the same parent email and the same slot is still `status = held`, `converted_at` empty. That hold is what the Pending Enrollments panel is showing, so the office sees "pending" for a family that already finished.

Cause: a hold is only flipped to `converted` by the browser, after the parent lands back on /join from Stripe (`get-membership-hold` with `action: "convert"`). If the parent closes the tab, loses signal, or the redirect does not complete, payment succeeds, the membership is created by the webhook, and the hold is orphaned forever. Nothing on the server ever closes it. That also means the dead hold keeps counting as an occupant in `get-open-slots`, so a real open seat can look taken.

This will keep happening on every checkout where the parent does not return to the page.

## The fix

**1. Close the hold on the server, not in the browser.**
Pass the hold token into the Stripe checkout metadata in `create-membership-checkout`, and when the membership is created (in the shared completion path used by the webhook), mark that hold `converted` with `converted_at`. Add a fallback for holds created before this change: on completion, also close any still-`held` hold matching the same standing slot and parent email.

**2. Safety net in the 15 minute sweep.**
In `sweep-membership-holds`, before expiring anything, flip any `held` hold to `converted` when a non-cancelled membership already exists for the same slot and parent email. Nothing is deleted, ever.

**3. Repair Armani's row.**
One data update: set that hold to `converted` with a note pointing at the membership. No membership rows touched.

**4. Payment-problem filter you cannot clear.**
"Show them" sets the payment filter to "Payment problems" and also flips on "Include cancelled and paused", with no obvious way back. Change the banner button to a toggle: it reads **Show them** normally, and **Show everyone** while the problem filter is on, restoring the previous payment filter and the include-inactive switch when clicked. Also add a small "Clear filters" link next to the filter row whenever any filter is off its default, so no filter state is ever a dead end.

## Verification

- Re-query Armani: membership still `active`, hold now `converted`, and the Pending Enrollments panel no longer lists them.
- Confirm no other `held` holds have a matching completed membership; report any others found and fix them the same way.
- Confirm the slot's open-seat count reflects the hold no longer occupying a seat.
- On /admin/memberships: click Show them, confirm the button reads Show everyone, click again, confirm the list and both filters return to where they were.

## Technical notes

Files touched: `supabase/functions/create-membership-checkout/index.ts` (hold token in metadata), `supabase/functions/_shared/membership-completion.ts` (convert on create + email/slot fallback), `supabase/functions/sweep-membership-holds/index.ts` (reconcile pass), `src/pages/admin/MembershipsAdmin.tsx` (toggle + clear filters). No schema change, no RLS change, no change to capacity triggers or `get-open-slots` logic itself.
