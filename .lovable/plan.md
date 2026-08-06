# Add the real first lesson date to hold texts

## How the first lesson date is computed today

Two pieces, both already in the codebase, combine to produce the date a family actually starts:

1. `firstLessonDate(dow)` in `supabase/functions/_shared/membership-pricing.ts` — returns the first occurrence of the slot's weekday on or after the later of today (Pacific) and `SEASON_START`.
2. `buildMembershipOccurrenceRows` in `supabase/functions/_shared/membership-occurrences.ts` — starts at that date and walks forward one week at a time, skipping any date in the studio closure set (`fetchClosureDateSet`).

Membership completion (`_shared/membership-completion.ts` → `resolveStartDate` + `ensureOccurrences`) and `move-membership-slot` both use exactly this pair. So the true first lesson is: `firstLessonDate(day_of_week)`, advanced by 7 days while that date is a closure date.

Neither function's logic changes.

## What to build

A small shared helper, `firstLessonDateForSlot(day_of_week)`, placed next to the existing helpers in `supabase/functions/_shared/`. It calls `firstLessonDate` and `fetchClosureDateSet` and applies the same closure-skip rule the occurrence builder uses, then returns both the ISO date and a short label like `Tue Aug 12`. No new date math is invented — the weekday search and closure skip both come from the existing functions.

Then update the three message builders to use `"<Day> <Mon D>, <Time>"` in place of `"<Day> <Time>"`:

- `create-membership-hold` — the invite text.
- `send-membership-hold-invites` — the per-swimmer parts in the batched text.
- `send-membership-hold-reminder` — the manual reminder text, composed before the preview branch so preview and real send are byte-identical.

Resulting text:

```text
Aquatic Dreams: we're holding a Private Swim spot for Alessandra, Tue Aug 12, 4:00 PM. Finish enrollment within 40.5 hrs: <link>
```

If a closure lookup fails, fall back to the current day + time wording rather than blocking the send.

## Not touched

`held_until`, the 30-minute manual rate limit, `reminder_sent_at`, the automatic sweep, capacity logic, and any already-delivered message.

## Verification

1. Preview Alessandra's hold and confirm it reads `Tue Aug 12, 4:00 PM` (actual computed date), then send once on your go-ahead and confirm the delivered text matches the preview exactly.
2. Cross-check that date against what `membership_occurrences` would generate for her slot today, using the same helper path.
3. Confirm no stored message rows are rewritten — the change affects composition at send time only.
