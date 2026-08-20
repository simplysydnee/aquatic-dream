# Fill one private coach before opening the next

Private lessons only. Parents stop seeing a second coach's open times on a configured day until the primary coach for that day is essentially full. Nothing about capacity, checkout, holds, or existing memberships changes.

## The rule

For a configured day, one instructor is the primary. A non-primary instructor's private slots are hidden from parents while the primary still has 2 or more open slots left. Once the primary is down to 1 or 0 open, everyone's slots show. The primary is always visible. Slots with no instructor are never gated and never count toward anyone's fill.

Safety fallback: if applying the gate would leave a day with zero bookable private times, the gate is dropped for that whole day and every open slot shows.

## Configuration storage

New tiny table `private_slot_gating_rules`:

- `day_of_week` (0-6, unique), `primary_instructor_id` (FK instructors), `active` boolean, `created_at`.
- Seeded with Wednesday = Karolina Imfeld, Thursday = Liana Herrera.
- Read only by the `get-open-slots` edge function (service role). No public/anon grant, no admin UI this phase.
- Empty or all-inactive table means no gating anywhere, so the safe default is exactly today's behavior. Turning it off is `update ... set active=false` or deleting rows.

## Server change: `supabase/functions/get-open-slots/index.ts`

After the existing `result` array is built (so `enrolled_count`, `spots_left`, `is_full` are already correct), add a pass that sets a new boolean field `gated` on every slot. Nothing is removed from the response.

1. Default `gated = false` for every slot. Non-private plans are never touched.
2. Load active rules. No rules, no rule for that day, or a rule whose primary instructor has no active private slots that day → the day stays ungated.
3. For a configured day, open count per instructor = private slots on that day with `spots_left > 0` and a non-null `instructor_id`.
4. If the primary's open count is >= 2, mark every non-primary private slot on that day `gated = true`. Primary slots and null-instructor slots stay `gated = false`.
5. Fallback, evaluated per day immediately after step 4 and before the response is assembled: count private slots on that day with `spots_left > 0 && !gated`. If that is 0, clear `gated` on every private slot for that day AND emit a `console.error` naming the day and rule, since the rule makes this unreachable and a firing means a config change broke an assumption.

Full slots are untouched by the logic beyond being excluded from the open counts. The level filter and hold-exclusion logic run exactly as today.

Against current live data this produces: Wednesday, Karolina has 4 open, so Liana's 6:30 is gated; Thursday, Liana has 3 open, so all 6 Karolina slots are gated and Thursday shows 3 times; Tuesday, Friday, Saturday unchanged.

## Frontend

`src/pages/JoinMembership.tsx` is the parent-facing private slot list on /join (loads via `supabase.functions.invoke("get-open-slots")` in `loadSlots`, then `planSlots` → `displaySlots` → `visibleSlots` → `groupedSlots`).

- `planSlots` stays ungated. It keeps every slot for the plan so no availability decision loses sight of gated times.
- `displaySlots` does the gating: bookable-and-ungated when that list is non-empty, otherwise bookable (with a `console.error`), otherwise `planSlots`.
- The "No open spots right now / Join the waitlist" branch changes from `displaySlots.length === 0` to `planSlots.length === 0`, so gating can never trigger the full/waitlist state. The waitlist is still only ever opened by an explicit tap and never auto-submitted.

`src/pages/SwimLessons.tsx` also calls `get-open-slots`.

- `ProgramCards` and `summarizeWhen` keep using the full slots array. They describe when a program runs, not what is available, so they never filter `gated`.
- Only `OpenTimes` filters `gated`, and only for the rendered times. Its `FullNotice` branch is computed from ungated availability (`openAll.length === 0`), so gating can never make a program read as full. If gating empties a program's visible times while ungated ones exist, it falls back to showing the ungated list and logs a `console.error`.

## Every path that reads standing_slots, and what happens to it

Parent-facing, gets the filter:
- `src/pages/JoinMembership.tsx` display list only (via get-open-slots)
- `src/pages/SwimLessons.tsx` `OpenTimes` only (via get-open-slots)


Parent-facing but slot already chosen, must NOT be gated (unchanged):
- `get-membership-hold`, `get-membership-quote`, `create-membership-checkout`, `membership-completion`, `submit-membership-waitlist`, `membership-calendar-ics`, `get-membership-by-token`, `move-membership-slot`, `sweep-membership-holds`.

Admin/staff, reads `standing_slots` directly and never sees `gated`:
- `src/hooks/useSlotOpenings.ts` (and its consumers: `EnrollFamilyDialog`, `CreateMembershipHoldDialog` chips), `StandingSlotsAdmin`, `MembershipsAdmin`, `MembershipHoldsPanel`, `CheckInAdmin`, `KioskCheckIn`, `PrintDaySchedule`, `useCalendarData`, and the MCP tools (`list_standing_slots`, `update_standing_slot`, `move_membership_slot`, `create_membership_hold`).

Front desk can therefore still book and hold any gated slot by phone.

## Mid-session behavior

A parent whose page is already open keeps the slot list they loaded. If a slot becomes gated behind them, nothing in their tab changes and they can still pick it and finish checkout: `create-membership-checkout` and the capacity trigger never read `gated`. Gating is display only, so a gated-but-open slot never hard-fails. A held or enrolled slot is never affected. If a hold expires and re-opens a primary's slot, the next load may hide a non-primary slot again; that is expected.

## Every way this could return an empty list, and the guard

1. Gate hides the only open times on a day → per-day fallback in step 5 clears the gate for that day.
2. Gate applied when the primary has no active slots that day (coach removed or deactivated) → step 2 skips the day entirely.
3. Rule points at a deleted or inactive instructor → same skip in step 2.
4. Small Group level filter combined with gating → gating only touches `plan_key = 'private'`, so kid_group and adult_group are untouched.
5. Config table empty, unreadable, or the rules query errors → treat as no rules and return today's exact behavior; the gating pass is wrapped so a failure can never blank the slot list.
6. Every slot on a day is full → those slots are already `is_full`, gating leaves them alone, and /join's existing "all full, show waitlist" path still fires.

## Out of scope

No capacity trigger, checkout, or webhook changes. No kid_group or adult_group changes. No middle-slot vs edge-slot logic. No admin config UI.
