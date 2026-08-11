# Fall 2026 Re-engagement SMS

Clone the summer2026 outreach pattern into a parallel fall2026 campaign, and make the welcome-back page work for any outreach code. The three summer2026 files stay untouched.

## 1. New shared module: `supabase/functions/_shared/fall2026-outreach.ts`

Same structure as the summer2026 module (phone keying, junk-name filtering, bucketing by phone, no-phone reporting), with these differences:

**Audience (three sources, no session-date filter)**
- `swim_enrollments` — all rows, `status != 'cancelled'`
- `lesson_bookings` — `lesson_type in ('private','semi-private')`, `status not in ('cancelled','abandoned')`
- `lesson_requests` — all rows (`parent_phone`, `parent_first_name`/`parent_last_name`/`parent_name`, `child_first_name`/`child_name`). Confirmed these columns exist.

**Segments (two)**
- `PREVIOUS` — bucket has at least one enrollment or booking row
- `INQUIRY` — bucket has only lesson_requests rows

A phone in both is PREVIOUS.

**Exclusions**
- Phones on `memberships` with status `active`, `pending_cancel`, `paused`
- New: phones with a `swim_enrollments` row where `status = 'confirmed'` and the joined `swim_sessions.session_end_date >= current_date`. Built as a real join on `session_id` (verified today this matches 0 phones, so it will not change counts now, but holds on rerun).
- Opt-out list via the existing `_shared/sms-opt-out.ts`
- Unusable parent first name, and no phone on any row (both reported)

**Copy** (parent first name only, no child names, no dollar amounts)
- PREVIOUS: `Hi ${parentFirst}! Fall lessons are here at Aquatic Dreams, come join us. Weekly spots are limited: ${FALL2026_LINK}`
- INQUIRY: `Hi ${parentFirst}! Fall swim lessons are open at Aquatic Dreams. See openings and enroll: ${FALL2026_LINK}`

**Constants**
- `FALL2026_LINK = "https://aquaticdreamsswim.com/join?src=fall2026"`
- `FALL2026_KIND = "fall2026_outreach"`

## 2. New edge functions

- `build-fall2026-outreach` — admin-only report, writes nothing. Same response shape as the summer version: counts, per-segment samples, already-sent count against `reminder_logs` for `FALL2026_KIND`, opted-out list, no-phone and unusable-name lists.
- `send-fall2026-outreach` — admin-only manual send. Body `{ segment: 'PREVIOUS' | 'INQUIRY', confirm: true, limit, pacing_ms }`. Keeps the already-sent skip, opt-out skip, pacing delay, and dual logging (`sendSms` for the client texts inbox plus `logSms` into `reminder_logs`). No cron, no scheduler, no auto-continue.

## 3. Welcome-back gate

- `src/lib/joinSrc.ts`: replace the single `WELCOME_BACK_SRC` with `RECOGNIZED_OUTREACH_SRCS = ["summer2026", "fall2026"]` plus `isRecognizedOutreachSrc(src)`. Existing `resolveJoinSrc` / seen-flag helpers stay.
- `src/App.tsx`: `JoinEntry` gates on `isRecognizedOutreachSrc(readSrcParam())` instead of the equality check.
- `src/pages/WelcomeBack.tsx`:
  - Button navigates using `resolveJoinSrc()` for this visit, not a hardcoded summer2026 (existing bug).
  - Headline becomes src-aware: summer2026 keeps "Thank you for swimming with us this summer", fall2026 gets "Fall lessons are here at Aquatic Dreams", anything else gets "Welcome back to Aquatic Dreams".
  - The four explainer points and the no-dollar-amounts rule stay the same for every src.

## Verification before any send

Run the build function and report:
- Total eligible, PREVIOUS vs INQUIRY breakdown
- No-phone and unusable-name exclusion counts
- Opted-out count inside this list
- First 10 rendered messages per segment with real names and the real link
- How many phones the new currently-mid-session exclusion actually matched (expected 0, confirmed by query)
- A live check that `?src=summer2026` still shows the original headline and still carries `src=summer2026` through to /join

No sends happen until you review that report and call `send-fall2026-outreach` yourself with `limit: 10`.
