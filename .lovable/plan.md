## Verification plan: returning family Yellow swimmer repro

Run a Playwright script against the live preview to confirm the `session_periods_public` grants fix resolves the "Sea Scouts is full" message for a returning Yellow (school-age) swimmer with missing DOB.

### Steps

1. Launch headless Chromium at 1280x1800 against `https://id-preview--06567201-0872-4d52-b1f6-790fb7d7ed1f.lovable.app/enroll`.
2. Choose "Returning swimmer" entry path.
3. Enter the email of a known returning family that has a Yellow-level swimmer with `dob = NULL` (query DB first to pick a valid test family — read-only `supabase--read_query` against `swim_enrollments` + `swimmers` to find one).
4. Select that swimmer from the returning list.
5. On the level choice step, pick "Stay at the same level" (Yellow / Sea Scouts).
6. Capture screenshot of the SessionPicker screen.
7. Assert one of:
   - Session 2 row renders with a bookable CTA (pass), or
   - "Sea Scouts is full for this session" still shows (fail — need further diagnosis).
8. Also print the DOM text of the picker container and any visible session period names for the record.
9. Report back with the screenshot path, the rendered text, and a clear pass/fail.

### If it fails

Re-check live as `anon`:
- `curl` the REST endpoint for `session_periods_public` with the anon key.
- Run `public.check_session_periods_public_access()` via `supabase--read_query`.
- Inspect SessionPicker's network call in Playwright (log responses) to see whether the rows arrive but get filtered client-side (age group, capacity, enrolled_period_ids).

No code changes proposed — this plan is verification only. If the repro fails I will return with findings before changing anything.
