## Fix two issues on private lessons

### 1. Better DOB picker on the public private-lesson enrollment form
File: `src/components/private-lessons/PrivateBookingFlow.tsx`

Replace the single `<Calendar captionLayout="dropdown-buttons">` popover (where day cells get cramped) with a clearer, more obvious control:

- Three side-by-side `<Select>` dropdowns: **Month** (Jan–Dec), **Day** (1–31, auto-clamped to the valid days for the chosen month/year), **Year** (current year down to current year − 18, since this is for kids; fall back to 1920 if needed).
- Live "Age: X" preview below the row (already exists, keep).
- Inline validation: if the resulting date is in the future or yields age > 17, show a friendly error.
- Keep the underlying `form.childDob: Date` shape so the rest of the flow (`calcAge`, submit payload) is unchanged.

This is the standard pattern for birthdays and removes the calendar-grid confusion the user hit.

### 2. New private-lesson blocks not appearing in booking flow
Root cause: the admin form in `src/pages/admin/PrivateLessonsAdmin.tsx` is saving inconsistent rows. The most recent insert is `kind:"weekly"`, `day_of_week:1` (Monday) but `start_date=end_date=2026-06-09` (a Tuesday) — so `fetchOpenSlots` in `src/lib/privateBooking.ts` correctly filters it out (no Monday exists in the 1-day window).

Fixes in `PrivateLessonsAdmin.tsx` `addBlock()`:

- **One-time** type → force `kind="date_range"`, `day_of_week=null`, `end_date = start_date`. Do not allow a stray `day_of_week` from prior form state.
- **Weekly** type → validate that `start_date`'s weekday and `end_date`'s weekday range actually contains at least one occurrence of the chosen `day_of_week`; otherwise show a toast: "The selected weekday doesn't fall inside the date range."
- **Date range** type → if `day_of_week` is left blank, store `null` (every day in range becomes available); otherwise validate as in Weekly.
- Clear `day_of_week` / `start_date` / `end_date` from form state whenever the Type select changes, so leftover values from a previous selection can't get persisted.

No changes needed in `src/lib/privateBooking.ts` — the resolver logic is correct; the bad data was the problem.

### Verification
- Add a Weekly block (Mon, two-week range) → confirm Monday slots appear in the public booking flow.
- Add a One-time block (single date, any weekday) → confirm only that day's slots appear.
- Open the enrollment form, use the three dropdowns to pick a child's birthday, confirm Age preview updates and submit works.
