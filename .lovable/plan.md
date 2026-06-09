## Goal
Let parents enroll in a session that has already started. The picker should:
1. Still display sessions whose period hasn't ended (already true).
2. Hide past lesson dates and show only the remaining classes.
3. Show a **prorated price** = remaining lessons × per-lesson rate.
4. At checkout, if the session has already started, charge the **full prorated amount now** (skip the first-timer "pay session fee on day 1" option, since day 1 has passed).

## Scope
Frontend display + checkout pricing only. No new tables, no admin changes, no change to returning-customer behavior for not-yet-started sessions.

## Changes

### 1. `src/components/swim-enrollment/SessionPicker.tsx`
- Today's date (Pacific) computed once at component mount.
- After fetching `session_lesson_dates` for displayed sessions, derive `remainingDates[sessionId]` (lesson_date >= today, not cancelled). Do this for *all* visible sessions, not only selected ones — needed for pricing in the card.
- If a session has 0 remaining lesson dates → hide it (treat like full).
- In each session card:
  - Replace "X spots left" with the count of **remaining classes** alongside spots.
  - Show prorated price badge: `$<remaining × price_per_lesson>` (strike-through the full `session_price` when it differs).
- Update the date list under selected sessions to show only remaining dates, with header like "Session XYZ — N classes remaining (started <date>)".
- Hand the prorated price up to the parent (extend `onSelect` to pass `{ sessionIds, proratedPrices: Record<sessionId, number> }`, or fetch again in parent — see step 2).

### 2. `src/pages/SwimEnrollment.tsx`
- After session selection, also load `session_lesson_dates` for the chosen sessions to compute prorated price per session (`remainingLessons × price_per_lesson`, falling back to full `session_price` when session hasn't started).
- Use prorated value in the "today total" display and pass into `sessionPrices` map (already plumbed through to checkout). Also pass a new flag `sessionStarted: Record<sessionId, boolean>` so the checkout step knows when the in-person option must be hidden.

### 3. `src/components/swim-enrollment/EnrollmentCheckout.tsx`
- Accept `allSessionsStarted: boolean` (true when every selected session has already started).
- When `hasFirstTimers && allSessionsStarted`: skip the radio choice and force `payAhead = true` (full reg + prorated session fee). Show copy: "This session has already started — full amount due today."
- When mixed (some started, some not): still force `pay_ahead` for the started ones. Simplest: if **any** selected session has started for a first-timer, force pay_ahead globally and hide the toggle.

### 4. `supabase/functions/create-checkout/index.ts`
- For each session being charged, query `session_lesson_dates` (not cancelled, date >= today PT). If `remaining < total_lessons` then `unit_amount = remaining × price_per_lesson * 100`; otherwise keep `session_price`.
- Refuse the request (409) if `remaining === 0` for any selected session.
- If `child.isFirstTime && payAhead === false` but any of that child's sessions has started → override to `payAhead = true` (server-authoritative, mirrors UI).
- Update the defensive guard: allowed `unit_amount` is either `session_price` or `remaining × price_per_lesson` based on DB lesson dates. Continue refusing anything else.

### 5. Confirmation copy (`EnrollmentConfirmation.tsx`)
- Already derives session fee from `totalDue - registrationFee`; just verify it renders correctly with the prorated total (no logic change expected, only sanity check after wiring).

## Pricing rule
Per-session charge = `min(total_lessons, remaining_lessons) × price_per_lesson`. For sessions not yet started, `remaining_lessons === total_lessons`, so the existing `session_price` stays unchanged.

## Out of scope
- Editing past-session enrollments retroactively.
- Admin manual entry flow (`admin-create-enrollment`) — can be a follow-up if needed.
- Refund handling for missed classes once enrolled.