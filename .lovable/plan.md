

## Fix the DOB step blocking new enrollments

I tested the published site (`aquaticdreamsswim.com/swim-enrollment`) end-to-end. **The site IS deployed and working** — homepage, navigation, and Supabase data all loaded. But step 1 has a real bug that almost certainly explains your customer's complaint.

### The bug

Step 1 asks for the child's date of birth using a **native HTML `<input type="date">`** (SwimAssessment.tsx line 222). Two things go wrong for real users:

1. **Date format mismatch**: native date inputs require `yyyy-mm-dd` internally, but the placeholder shows `mm/dd/yyyy`. On many mobile browsers (especially iOS Safari and older Android), if the user types digits instead of using the spinner/picker, the value is rejected silently. The field stays empty, age never calculates, and the **Next button stays grayed out forever**. I reproduced this exact behavior in my test — typed `06/15/2018`, field stayed blank, Next stayed disabled. No error message appears.
2. **No fallback / no error text**: there's no "please pick a date" hint, no manual month/day/year selectors, and no indication of why Next is disabled. A frustrated customer just sees a dead button and bounces.

This is almost certainly what your customer hit — especially if she was on mobile.

### Fix

Replace the single native date input with a friendlier 3-dropdown picker (Month / Day / Year) that:

- Works identically on every browser and device — no native picker quirks
- Shows the calculated age live ("Age: 7 years old") as soon as all three are picked
- Restricts Year dropdown to 2013–2023 (the valid age 3–12 range), so the user literally can't pick something invalid
- Keeps the existing `dob` string + age calculation downstream — the rest of the flow is untouched
- Adds a small inline hint under the dropdowns: *"Pick month, day, and year — your child's age will appear below."*

```text
What is your child's date of birth?
This helps us find the right group (ages 3–12)

[ Month ▼ ]  [ Day ▼ ]  [ Year ▼ ]

Age: 7 years old ✓

                                       [ Next → ]
```

The Next button enables the moment all three are picked and age lands in 3–12.

### Bonus fix while in this file

Add a tiny "Why is Next disabled?" tooltip on the disabled button that reads *"Please select a complete date of birth"* — so even if the dropdown approach somehow trips someone up, they get a clear reason instead of a dead button.

### Files touched

- `src/components/swim-enrollment/SwimAssessment.tsx` — replace the `<Input type="date">` block (lines ~220–235) with a 3-Select component using the existing shadcn `Select`. Keep `dob` state as a `yyyy-mm-dd` string so `calculateAge`, `handleAgeNext`, and the parent `onComplete(level, age, dob)` contract all work unchanged.

### Not doing

- ❌ No DB or edge function changes — this is purely a client-side input fix
- ❌ No change to the rest of the enrollment flow (Session, Details, Agreements, Payment all working — verified in network logs)
- ❌ No publishing — you'll still need to click **Publish → Update** after this fix to push it live

### After the fix

Once approved and published, the email reply you already drafted ("try again, give us feedback") will land much better — the issue she actually hit will be gone.

