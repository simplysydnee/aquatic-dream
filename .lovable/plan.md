

## Fix the DOB picker — replace 3-dropdown with a real calendar

The 3-dropdown picker is broken in two ways and is the wrong tool for this job:

### What's wrong

1. **Dob string is built in the wrong order.** Line 89 destructures as `[year, month, day] = dob.split("-")` but `dob` is stored as `yyyy-mm-dd` — that part is correct. **However**, the bigger trap: when the user picks Month first (the most natural first action), `year` and `day` are still empty, so `update()` calls `onChange("")` and the dropdown's controlled `value={month}` resets to empty on the next render. The Month selection visually disappears the moment they make it. Same for Day. **Nothing sticks until all three are picked in the right order** — and even then it's fragile.
2. **Year list is too narrow.** Only ages 3–12 are offered (10 years). Parents of a child who *just* turned 3 last week or who is 12¾ literally cannot select their kid's birth year. They see no option and assume the form is broken.
3. **It's a bad UX pattern in 2026.** Three coupled dropdowns for a date is clunky on mobile and desktop. Apple/Google/everyone use a calendar popover.

### The fix — switch to shadcn Calendar in a Popover

Replace the entire `DobPicker` component with a single button that opens a real calendar popover (the existing `src/components/ui/calendar.tsx` is already in the project). Two-month view, year/month dropdowns built in, defaults to a sensible date (7 years ago), disables future dates and dates older than 15 years.

**UX:**

```text
What is your child's date of birth?

[ 📅  Pick a date                    ▼ ]   ← button, full width on mobile

(after pick)
[ 📅  June 15, 2018                  ▼ ]
Age: 7 years old ✓

                                  [ Next → ]
```

**Behavior:**
- Click button → calendar popover opens
- Calendar shows month + year dropdowns at top so parents can jump straight to e.g. "June 2018" without clicking back arrow 84 times
- Disables: any date in the future, any date more than 15 years ago
- On select: popover closes, button shows formatted date ("June 15, 2018"), age appears below with the existing ✓ / "must be 3–12" hint
- Internal state stays as `yyyy-mm-dd` string so `calculateAge`, `handleAgeNext`, and the parent `onComplete(level, age, dob)` contract are unchanged
- Calendar uses `pointer-events-auto` per shadcn guidance so it stays clickable

**Validation messaging (keeps existing):**
- If picked age < 3 or > 12: show the existing inline "(must be 3–12)" red text and keep Next disabled
- Tooltip on disabled Next button stays as-is

### Files touched

- `src/components/swim-enrollment/SwimAssessment.tsx` — delete `DobPicker`, `MONTHS`, `daysInMonth`, and the Select imports for the picker; add Popover + Calendar + a small format helper. ~50 lines net deletion.

### Not doing

- ❌ No DB or edge function changes
- ❌ No change to assessment questions, session step, or downstream flow
- ❌ No new dependencies — `react-day-picker`, `date-fns`, Popover, and Calendar are all already in the project

### After this lands

You'll need to click **Publish → Update** to push to the live domain so your customer can retry.

