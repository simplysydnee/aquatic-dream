## Make every individual slot actionable on /admin/private-lessons

Right now the expanded slot grid under each availability block only shows status badges — you can't click a slot to do anything. That's why Jaclyn's 12:30–1:00 PM lesson on June 13 isn't deletable from this page: the booking exists, but the grid just renders a label. We'll make every tile a real action.

### Behavior per slot

**Booked slot (e.g. Jaclyn 12:30–1:00):** click opens a slot action dialog showing parent/swimmer/payment status with three buttons:
- **Cancel this lesson** — cancels just that occurrence (via existing `cancel-private-lesson-occurrence` edge function, which also auto-refunds if paid, per project rules).
- **Open booking** — pops the existing booking detail dialog (where you can cancel the whole series, charge, delete).
- **Close** — dismiss.

**Open slot:** click opens the same dialog with:
- **Block this slot** — inserts a one-time blackout entry in `instructor_booking_blocks` covering exactly that date + time window, so the public booker can no longer take it.
- **Close** — dismiss.

**Blocked/closed slot:** show a "Blocked" badge and allow **Unblock** (deletes the matching one-time blackout row).

### Visual changes

- Slot tiles become buttons with hover state + cursor pointer; keyboard accessible.
- Add a third visual state ("Blocked" — muted/strikethrough) alongside the existing Booked / Open states.
- Tiny "cancel" (✕) icon on booked tiles and "block" (🚫) icon on open tiles as an affordance, but the whole tile is clickable.

### Technical notes

- New `SlotActionDialog` component used inside `PrivateLessonsAdmin.tsx`.
- Cancel of a single booked occurrence: call existing `supabase.functions.invoke('cancel-private-lesson-occurrence', { body: { occurrence_id, reason } })`. Confirm with an AlertDialog first; surface refund outcome in the toast.
- Block-a-slot: insert into `instructor_booking_blocks` with `kind='date_range'`, `start_date=end_date=slot.date`, `start_time/end_time` = slot bounds, `slot_minutes` = block length, `is_blackout=true`, `day_of_week=null`, `pool_area` inherited from parent block. `SlotPicker` already filters out times overlapping blackouts, so this immediately removes the slot from public booking.
- Detect a "blocked" slot in `computeBlockSlots` by checking any blackout block from the same instructor that overlaps the slot window; tag the SlotRow with `blocked: { block_id }` so Unblock can target the right row.
- After any mutation, call `load()` to refresh state.

### Out of scope

- No backend schema changes.
- No changes to the public booking flow, email templates, or the existing block edit/delete buttons.
