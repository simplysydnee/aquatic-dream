## Problem

Parents trying to book private lessons hit **"Could not save booking — [check_slot_holds] slots_taken"**.

Root cause confirmed against the DB: there are 8 active `slot_holds` rows in the table right now, all tied to one anonymous `session_token` (`10eef87…mq5er7kf`). Holds are created by `SlotPicker → holdSlots()` keyed on a `session_token` that lives in React state for the lifetime of the `PrivateBookingFlow` mount.

If the parent:
- refreshes the page mid-flow,
- opens the booking page in a second tab,
- or comes back after an earlier failed attempt (e.g. our previous Stripe error)

…the React component remounts and generates a **new** `session_token`. The old `session_token`'s holds linger for 10 minutes (`held_until` default). When the parent finishes the legal step, `create-private-booking-setup` queries `slot_holds`, skips holds where `session_token === body.session_token`, and treats the orphaned old-session holds as "taken by someone else." Booking is rejected even though it's the same person.

Lesley Willems in the screenshot is hitting exactly this — the 8 stale holds in the DB cover her selected slots.

`slot_holds` is also only an advisory UX hint: it has no relationship to a real booking row and there's no DB-level uniqueness, so blocking on it isn't actually preventing double-booking. The real protection is the `lesson_booking_occurrences` conflict check (already in place above it in the same function).

## Plan

### 1. `supabase/functions/create-private-booking-setup/index.ts` — make slot_holds non-blocking

Two small changes inside the existing function, no schema changes:

a. **Drop holds from the hard conflict check.** Keep the `lesson_booking_occurrences` check exactly as-is — that's what actually prevents a real double-book. Remove the `slot_holds` lookup from the `taken` set used for the 409 `slots_taken` response. (We can leave the query in place for logging, or delete it; either is fine.)

b. **Claim the slots.** Right after the successful `lesson_bookings` + `lesson_booking_occurrences` inserts, delete every `slot_holds` row whose `(instructor_id, slot_date, start_time)` matches one of the slots we just booked — regardless of `session_token`. This releases stale holds left behind by refreshes/retries and prevents the next parent from seeing a ghost hold either.

### 2. No other files change

- `SlotPicker.tsx` / `privateBooking.ts` stay as-is — holds are still useful for the live availability grid (`fetchOpenSlots`) to gray out slots another live shopper is actively selecting. We're only changing how the **server** treats them at commit time.
- Frontend error parsing in `PrivateBookingFlow.tsx` stays — it's already surfacing the real server error correctly.

### Why this is safe

- Real double-booking is still blocked by the `lesson_booking_occurrences` conflict check (step `check_slot_conflicts`), which queries committed bookings excluding `cancelled` / `pending_card`.
- The 10-minute hold TTL was already the only thing keeping stale holds from blocking forever. Treating holds as advisory removes the entire stale-hold failure class.
- If two live shoppers truly race to the same slot in the same minute, the second one's `insert_lesson_booking` / occurrences insert will succeed for now (no DB unique index on `(instructor_id, slot_date, start_time)`), but that race already exists today — this change doesn't worsen it. If we want true race protection later, add a partial unique index on active occurrences; out of scope for this fix.

### Files

- `supabase/functions/create-private-booking-setup/index.ts` — remove holds from blocking conflict set; add post-insert cleanup of matching holds.

### Out of scope

- No DB schema changes, no new unique indexes.
- No changes to `admin-create-private-booking-setup` (different code path, admins aren't hitting this).
- No public-facing copy changes.
