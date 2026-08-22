# Demo the milestone texts on Weston Tickenoff

Goal: send you the two milestone texts (halfway and mastered) at 209-996-4423 so you can see exactly what a family receives.

## Current state (checked)

- Weston Tickenoff's membership phone is 209-985-1538, SMS consent on.
- He already advanced to Deep Sea Divers (blue) from the earlier test, and both yellow milestone texts are already logged as sent.
- His six blue skills are all unmarked, so blue is a clean slate for a fresh halfway and mastered run.

## Steps

1. Change the phone on Weston Tickenoff's membership to 209-996-4423.
2. Mark 3 of his 6 Deep Sea Divers skills as met, then trigger the halfway milestone. You get: "Weston is halfway through Deep Sea Divers! <chart link>".
3. Mark the remaining 3 skills as met, then trigger the mastered milestone. You get: "Weston mastered every Deep Sea Divers skill! <chart link>".
4. Report back the send-log rows (status, phone, timestamps) plus the exact message text.

## Things to know before approving

- These are real texts to 209-996-4423, and the chart links point at the live domain.
- The mastered send will auto-advance Weston from Deep Sea Divers to Ocean Masters (green) and add a level-history row, since that is now the built-in behavior.
- Weston's blue skill marks will show as met on the staff screen and the parent chart. Say the word and I can clear the blue marks and set him back to blue afterward so his record looks untouched.
- Nothing else is touched: no standing slots, no memberships beyond the phone field, no enrollment or capacity data.

## Technical notes

- Phone update: `memberships.parent_phone` on membership `bbbf604b-...` only.
- Skill marks via the existing `staff_mark_skill` path; milestone sends via the deployed `send-skill-milestone` function with `milestone: "halfway"` then `"mastered"`.
- The unique guard on `(swimmer_id, swim_level, milestone)` means each of these can only fire once for blue.
