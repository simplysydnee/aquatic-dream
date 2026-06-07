## Goal
When a level (e.g. Sea Divers) has **no bookable group sessions** — either every session for that level/age group is full or none are open — never let the parent advance to the info / legal / payment steps. Show a "this level is full" screen right after the assessment with two clear choices: **join the waitlist** or **book a private lesson**.

## Trigger
In `SessionPicker.tsx`, right after `fetchSessions()` completes, derive:

- `hasAnySlots` = any sessions returned at all for this level + age group
- `hasOpenSlots` = at least one slot with `spots_left > 0`

If `!hasAnySlots || !hasOpenSlots`, render the new full-level screen instead of the current "No sessions available…" card or the disabled grid. (We still show the disabled grid only when *some* sessions are open and others are full — that case is unchanged.)

## New component: `LevelFullScreen.tsx`
Lives in `src/components/swim-enrollment/`. Self-contained — no info/legal/payment dependencies.

Layout:
1. Headline: "**{Group name} is full for this session**" (e.g. "Sea Divers is full for this session").
2. Subhead: "We keep classes to 3 swimmers max so every kid gets real attention."
3. Two equal CTAs:
   - **Join the waitlist** — opens a compact inline form (parent first/last, email, phone optional, child first/last, child age, optional note). On submit, calls the existing `submit-waitlist-request` edge function with `swimLevel` set and `sessionId: null`. Shows success state ("You're on the waitlist. We have not enrolled you or charged you.").
   - **Book a private lesson** — `navigate("/book-private-lesson")`.
4. Footer line: phone + email for help.

The form is intentionally minimal so the parent never lands on a credit-card screen. The waitlist row is created with `swim_level` only (no specific session), which the owner sees in the admin Waitlist tab.

## SessionPicker wiring
- Accept new prop `level: SwimLevel`, `childAge: number` (already has both).
- New local state: `levelFull` derived from fetch results.
- When `levelFull`, return `<LevelFullScreen level={level} childAge={childAge} ageGroup={ageGroup} onBack={onBack} />` instead of the slot grid.
- Keep the existing per-slot disabled state for the mixed case (some full, some open).

## `submit-waitlist-request` edge function
No code change required — it already accepts `swimLevel` with `sessionId: null` and emails parent + owner.

## Admin Waitlist tab
No change required — already lists rows; level shows up via `swim_level` column.

## Out of scope
- The existing `SessionFullFallback` (post-checkout race-condition backstop) stays in place but should now rarely fire because the front-door gate catches the common case.
- No DB schema changes, no pricing changes.

## Files
- `src/components/swim-enrollment/LevelFullScreen.tsx` (new)
- `src/components/swim-enrollment/SessionPicker.tsx` (gate + render switch)
