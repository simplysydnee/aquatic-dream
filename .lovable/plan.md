# Family-first enrollment flow

## How slot openings are fetched today (requested report)

There is no shared openings hook. `StandingSlotsAdmin.loadAll()` fetches everything itself in one `Promise.all`:

- `standing_slots` — every row, `select("*")`
- `memberships` with status in `active, pending_cancel, paused` — counted per `standing_slot_id`
- `membership_holds` with `status = 'held'` and `held_until > now()` — counted per `standing_slot_id`

Those two counts are summed into an `occupancyCounts` map and passed to `StandingSlotsSummary` alongside the raw slot list and an instructor-name map. The chips themselves compute `open = capacity - occupancy[slot.id]` locally and render only times where the count is above zero. Private tiles count free coaches per time; group and adult tiles count free seats.

So a live draft hold already suppresses a chip, and the same rule is what `get-open-slots` applies for `/join`. Nothing is cached and there is no realtime subscription, so a refetch is needed after each hold change.

## What gets built

A new dialog, `EnrollFamilyDialog`, opened from a button on `/admin/memberships`. `CreateMembershipHoldDialog`, `StandingSlotsSummary`, and the chip flow are not touched.

### Shared openings hook

New `src/hooks/useSlotOpenings.ts` reproducing the three queries above and returning `{ slots, occupancy, instructorNames, loading, refresh }`. `StandingSlotsAdmin` keeps its own inline loader unchanged — the hook is used only by the new dialog, so the existing page cannot regress.

### Step 1 — find the family

`useFamilySearch(query, { groupByFamily: true })`. One card per family showing parent name, phone, and the swimmer list. Picking a family moves to the roster.

### Step 2 — the roster

One row per swimmer from the group, plus "Add a swimmer" for someone not on file. Each row shows:

- Swimmer name, editable inline
- KNOWN or NEEDS FORMS. KNOWN requires a DOB on file and `resolveSwimmerWaiver` returning `onFile: true`; anything else, including an expired waiver, is NEEDS FORMS. Manually added swimmers are always NEEDS FORMS. Resolution runs once per swimmer when the roster mounts, in parallel.
- Any current membership the swimmer holds, with day and time, for context only
- The current assignment, or an "Assign a time" button

Swimmers with a current membership stay selectable. Assigning a program they already hold shows an inline warning on the row and still allows it.

### Step 3 — assign a time

Program picker, then day-grouped time chips built from `useSlotOpenings`, using the same open-count rule the standing-slots chips use (free coaches for private, free seats otherwise). Choosing a coach when two are free at the same time works the same way.

On selection the dialog immediately calls `create-membership-hold` with `send_sms: false` and `hold_minutes: 20`, then returns to the roster with the assignment shown and refreshes openings. Swim level is derived from the slot exactly as `CreateMembershipHoldDialog` does: single accepted level wins, no accepted levels falls back to `swim_level`, a combined class sends null. Nothing is derived per swimmer.

Unassigning sets the hold's status to `cancelled` (the same write `MembershipHoldsPanel` already uses) and refreshes, which frees the slot immediately because capacity only counts `status = 'held'`.

### Step 4 — review and send

A table of every assignment: swimmer, program, day, time, instructor, monthly price from `membership_plans.monthly_price_cents`, and a combined monthly total.

Send calls `send-membership-hold-invites`:

- All KNOWN swimmers' hold ids as one batch
- Each new swimmer as its own batch of one

Two known plus one new is two calls and two texts. All known is one text. All new is one text per swimmer. Per-batch success and failure is reported in the dialog; a failed batch can be retried without resending a batch that already went out, because the function skips holds that already carry `sms_sent_at`.

### Abandoned drafts

Draft holds carry a 20 minute `held_until` and expire on the existing sweep. Closing the dialog leaves them. No new cleanup job.

## Not changed

- `CreateMembershipHoldDialog` and the slot-chip flow
- Capacity logic, the level gate, and the sweep
- No memberships and no Stripe objects are created
- No card entry and no consent capture at the desk

## Technical notes

- New files: `src/components/admin/holds/EnrollFamilyDialog.tsx`, `src/hooks/useSlotOpenings.ts`
- Edited file: `src/pages/admin/MembershipsAdmin.tsx`, header button only
- `create-membership-hold` and `send-membership-hold-invites` are called as they exist; no edge function changes
- `send-membership-hold-invites` requires every hold in a batch to share one parent phone, which holds here because all holds come from one family record

## Verification

1. Searching a phone returns one family card carrying all its swimmers.
2. A swimmer appearing under two parent emails collapses to one row with DOB preserved.
3. Assigning a time drops that slot's `spots_left` on `/join` right away.
4. Unassigning restores it right away.
5. Two known plus one new fires exactly two invite calls.
6. A draft left 25 minutes is expired by the sweep and the slot reopens.
7. The standing-slots chip flow behaves exactly as before.
