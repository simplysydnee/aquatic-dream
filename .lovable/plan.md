## Goals

1. When creating a Private or Semi-Private lesson, allow admin to mark it as already paid (cash/check/comp) so no Stripe link is sent and occurrences are saved as paid.
2. Clean up the New Event dialog — rename, reorder, and de-clutter.

---

## 1. Mark-as-paid on lesson creation

In `src/components/admin/calendar/LessonBookingFields.tsx`:

- Add three new optional fields to `LessonBookingFieldsData`:
  - `prepaid: boolean` (default `false`)
  - `prepaidMethod: "cash" | "check" | "comp" | "other" | null`
  - `prepaidReference: string` (optional — same rule as elsewhere; required only if Stripe, which doesn't apply here)
- Render a new section "Already paid?" with a checkbox. When checked:
  - Show payment-method select (Cash / Check / Comp / Other)
  - Show optional reference field (e.g. check #)
  - Hide / disable the "Email Stripe payment link" and "Charge entire series" toggles (they're irrelevant when prepaid). Show a small note: "Stripe link skipped — lesson(s) marked paid."

In `src/components/admin/calendar/AddPoolEventDialog.tsx` `handleLessonBookingSave`:

- If `lb.prepaid`:
  - Insert `lesson_booking_occurrences` rows with `payment_status: "paid"`, `payment_method: lb.prepaidMethod`, `payment_reference: lb.prepaidReference || null`, `paid_at: now()`.
  - Skip the `send-lesson-series-confirmation` / `send-lesson-booking-confirmation` Stripe-link calls entirely.
  - Toast: "Lesson booked & marked paid".
- Else: existing behavior unchanged.

The existing `lesson_occ_paid_requires_proof` constraint already accepts `payment_method IS NOT NULL` as proof, so no migration is needed.

---

## 2. New Event dialog UX cleanup

In `src/components/admin/calendar/AddPoolEventDialog.tsx`:

**Renames** (label-only — `event.value` strings stay the same to avoid data/migration impact):
- `"Swim Lesson"` → `"Swim Group"` (it's a recurring group class, not a one-off lesson — matches existing curriculum terminology)
- Keep `"Private"` and `"Semi-Private"` labels.

**Reorder `EVENT_TYPES`** to surface what's used most:
1. Private
2. Semi-Private
3. Swim Group
4. I Can Swim
5. Dive
6. Rental
7. Maintenance
8. Other

Change the default selected `eventType` from `"i-can-swim"` to `"private-lesson"` so the dialog opens on the most-used flow (and pre-fills price $65, title "Private Lesson").

**Layout de-cram** (mainly the screenshot's complaint):
- Bump dialog from `max-w-sm` to `max-w-md` so chips don't wrap onto 3 rows on desktop.
- Group chips into a single line scrollable row OR allow 2 rows max with slightly larger touch targets (`px-3 py-1.5 text-xs`).
- Move Date/Start/End into a tighter `grid-cols-3` with proper labels; current `grid-cols-[1fr_auto_auto]` causes uneven widths.
- Add subtle section dividers (a thin `border-t pt-2` between: type, schedule, lesson-specific fields, instructor/notes, actions) so the form reads as logical groups instead of a wall of inputs.
- Keep the dialog `max-h-[90vh] overflow-y-auto`.

---

## Technical Notes

- No DB migration required — `payment_method`/`payment_reference`/`paid_at` already exist on `lesson_booking_occurrences` and the constraint already supports manual proof.
- `event_type` enum values in `pool_events` (`swim-lesson`, `private-lesson`, `semi-private-lesson`, etc.) remain unchanged. Only the human-readable label "Swim Lesson" → "Swim Group" changes in the picker. Other places that render the event_type label (calendar block detail, lists) can stay as-is for this pass unless the user wants them renamed too — flag at end of implementation.
- The Stripe payment-link skip path simply no-ops the `supabase.functions.invoke` calls when `prepaid=true`.

---

## Files to edit

- `src/components/admin/calendar/LessonBookingFields.tsx` — add prepaid UI + types
- `src/components/admin/calendar/AddPoolEventDialog.tsx` — rename/reorder chips, default type, layout polish, branch on `prepaid` in save handler
