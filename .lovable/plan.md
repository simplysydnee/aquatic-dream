## The bug

Sessions are correctly stored as `monday_wednesday`, but every row in `session_lesson_dates` for the active sessions landed on **Tue/Thu** instead of **Mon/Wed** — exactly one day off. Verified directly:

```
Session 1 (Jun 8 – Jul 2)  →  stored as Jun 9 (Tue), Jun 11 (Thu), Jun 16 (Tue) …
Session 2 (Jul 13 – Aug 6) →  same Tue/Thu pattern
Total: 512 wrong rows across all active classes
```

That's why the enrollment "Pick Your Sessions" screen shows *Tue, Jun 9 / Thu, Jun 11 / …* underneath each time slot.

## Root cause

Both `src/pages/admin/SessionsAdmin.tsx` (auto-generate on create) and `src/components/admin/ManageDatesModal.tsx` (regenerate button) use the same fragile pattern:

```ts
const cur = new Date(period.start_date + "T00:00:00"); // local midnight
…
classDates.push(cur.toISOString().slice(0, 10));        // converts to UTC → off-by-one in some TZ
```

When the browser/runtime timezone is **ahead of UTC** (e.g. an admin in Europe creates the session, or the row was seeded from a UTC+TZ context), `toISOString()` rolls each date forward by a day — producing Tue/Thu from a Mon/Wed iteration. The day-of-week filter is local but the serialization is UTC, so the two disagree.

## Fix

Two parts: repair the data, then prevent the bug from recurring.

### 1. Repair the data (migration)

For every row in `session_lesson_dates` whose date does not match its parent session's `day_of_week`, regenerate the dates from scratch using SQL `generate_series` (timezone-safe, no JS Date involved). For each affected session:

- delete existing `session_lesson_dates` rows that aren't tied to a confirmed enrollment occurrence
- re-insert the correct Mon/Wed (or whatever `day_of_week` says) dates between `session_start_date` and `session_end_date`
- preserve any per-date `is_cancelled` / `cancel_reason` flags by keying on the *position* (1st class, 2nd class, …) where possible, otherwise reset to defaults

### 2. Code fixes (both files)

Replace the broken `toISOString().slice(0,10)` serialization with a local-date formatter so the day used in `getDay()` is the same day written to the database:

```ts
const fmtLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
```

Files to edit:
- `src/pages/admin/SessionsAdmin.tsx` — line 320 (auto-generate after `INSERT swim_sessions`)
- `src/components/admin/ManageDatesModal.tsx` — line 50 (`generateLessonDates` helper used by the "Regenerate dates" button)

Also tighten the day parser in `SessionsAdmin.tsx` line 315 — the current `.charAt(0).toUpperCase() + d.slice(1)` then lookup in a capitalized `dayMap` works, but switch to a single lowercase map shared with `ManageDatesModal.tsx` to remove duplicate maps.

## Verification

After running the migration and shipping the code fix:

1. Re-query `session_lesson_dates` — every row's `EXTRACT(DOW FROM lesson_date)` must match the session's `day_of_week` (1+3 for `monday_wednesday`, etc.).
2. Reload `/swim-enrollment`, pick a Session 1 spot — chips should now read **Mon, Jun 8 · Wed, Jun 10 · Mon, Jun 15 …** through **Wed, Jul 1 · Thu, Jul 2** (final make-up day if applicable).
3. Open the admin **Manage Dates** modal on a class and click "Regenerate" — the regenerated set should be Mon/Wed, not shifted.

## Out of scope

- No changes to enrollment/payment flow, calendar, or emails.
- No schema changes — just data correction in `session_lesson_dates` and the two TS files.
