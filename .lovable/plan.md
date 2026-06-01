## Skip waiver step when swimmer already has one (name + DOB, within 1 year)

### Source of truth
Use `visitor_waivers.swimmers` (jsonb array of `{first_name, last_name, dob}`) signed within the last 365 days. A swimmer is considered covered when at least one row's `swimmers` array contains a case-insensitive name match plus an exact DOB match, AND `signed_at >= now() - interval '1 year'`.

### 1. Database — security-definer RPC
Add `public.swimmer_has_active_waiver(_first text, _last text, _dob date) returns boolean` so the public flows can query without exposing the whole `visitor_waivers` table. Granted to `anon` and `authenticated`. Uses a jsonb existence subquery and a 1-year cutoff.

### 2. Private lesson booking flow
File: `src/components/private-lessons/PrivateBookingFlow.tsx`

After the **info** step (which already collects child first/last + DOB) and before transitioning to the **legal** step, call the RPC. If it returns `true`:
- Skip directly from `slots` → `card` (bypass `legal`).
- Display an inline note on the info step: "✓ Waiver on file for {Child Name} — you won't need to re-sign."
- On `confirm-private-booking`, mark the booking's `waiver_signed_at` to `now()` so it doesn't look unsigned.

### 3. Swim enrollment flow
Files: `src/pages/SwimEnrollment.tsx` and its `LegalAgreements` step.

Same pattern: after the parent enters child first/last + DOB, call the RPC. If covered:
- Skip the legal step entirely.
- Show a small "Waiver on file" badge.
- On enrollment insert, set `waiver_signed_at = now()` (or copy from the matched waiver's `signed_at`).

### 4. Backfill on completion (so flows are self-reinforcing)
When a user *does* complete the legal step in either flow, also insert a row into `visitor_waivers` containing that swimmer (in the `swimmers` jsonb). This means a child who signs once via the swim enrollment flow will auto-skip on the next private booking, and vice versa. Done inside the existing `confirm-private-booking` and swim enrollment edge functions / write paths.

### Edge cases
- DOB stored on the existing swimmer entries as ISO `YYYY-MM-DD`; the RPC compares as `date` and trims/lowercases name strings.
- If `dob` is missing on stored swimmers (older rows), they're ignored — no false positive.
- Admin-created bookings are unaffected.

### No file changes yet — migration first
Migration runs first so the new RPC and any indexes (GIN on `visitor_waivers.swimmers`) exist before the front-end calls it.
