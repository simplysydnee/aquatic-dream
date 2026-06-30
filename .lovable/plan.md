## Root cause — found, with evidence

Symptom: nearly every group-class swimmer on today's roster (32 sessions, monday_wednesday) shows "waiver missing" in CheckInAdmin/KioskCheckIn, even though `waiver_signed_at` is set on their enrollment row.

Two layered bugs, both surfaced by today's `swimmer_has_waiver_on_file` rewrite. The `fuzzystrmatch` extension is enabled and the function itself is not throwing — it's cleanly returning `false`.

### Bug 1 — Enrollment data has names in the wrong columns

Concrete examples from today's roster:

| `child_name`     | `child_first_name` | `child_last_name` | `child_dob` | RPC result |
|------------------|--------------------|-------------------|-------------|------------|
| Abbie Cortes     | NULL               | NULL              | NULL        | `false`    |
| Casey Turk       | "Casey Turk"       | NULL              | 2021-04-07  | `false`    |
| Amara Bola       | "Amara Bola"       | NULL              | 2019-10-22  | `false`    |
| Luca Batista     | "Luca"             | "Batista"         | 2022-01-19  | `false` ← Bug 2 |
| Adalyn Gutierrez | "Adalyn"           | "Gutierrez"       | 2018-08-17  | `true`     |

`enrollments_waiver_status` calls the function with `e.child_first_name, e.child_last_name`. When those are NULL or the full name is stuffed into `child_first_name`, the function gets garbage input and correctly returns `false`. The legacy `child_name` column has the right data — the RPC just never looks there.

### Bug 2 — Email/phone gate is too strict

Today's rewrite added this clause:

```
(norm_email IS NULL AND norm_phone IS NULL)
OR (email match) OR (phone match)
```

So if either email or phone is passed, a waiver match also requires an exact email or phone match. Real example: Casey Turk's enrollment is `turkpatty9@gmail.com`; the visitor waiver was signed with `turkpatty@gmail.com` (no `9`). Same swimmer, same DOB, same last name — but the gate rejects it. Previously, name + DOB alone was enough.

`enrollments_waiver_status` and `bookings_waiver_status` both pass `parent_email` and `parent_phone`, so every caller now hits the strict gate.

Combined effect: any enrollment with malformed split-name columns OR a slightly different email on the waiver vs the enrollment shows "waiver missing" today. That's most of the Mon/Wed roster.

`fuzzystrmatch` is enabled (verified). No errors are being thrown — the function returns `false` cleanly. The "caller defaults to false on error" hypothesis is not what's happening.

---

## Fix plan (waiver function only — no booking/checkout/card-reuse touched)

### Step 1 — Loosen the email/phone gate in `swimmer_has_waiver_on_file`

Treat email/phone as a **tie-breaker / strengthener**, not a hard requirement. Effective rule:

- A waiver matches if `last_name + dob + first_name` (with the existing uniqueness-gated fuzzy first-name logic) matches.
- Email/phone match is no longer required. We keep the parameters so we don't break call sites, but stop filtering on them in the match clause.

This restores pre-today behavior for the email/phone dimension while keeping the new uniqueness gate for first-name fuzziness.

### Step 2 — Make `enrollments_waiver_status` and `bookings_waiver_status` resilient to legacy/malformed name columns

When `child_last_name` is NULL, derive `(first, last)` from `child_name` by splitting on the last space. When the split columns are present and well-formed, use them as-is. Concretely, replace the direct column pass with COALESCE'd derivations:

```sql
-- pseudo
first := COALESCE(NULLIF(e.child_first_name, ''),
                  split_part(e.child_name, ' ', 1))
-- when child_last_name is empty AND child_first_name contains a space, also re-split
last  := COALESCE(NULLIF(e.child_last_name, ''),
                  NULLIF(substring(e.child_name from position(' ' in e.child_name)+1), ''),
                  NULLIF(substring(e.child_first_name from position(' ' in e.child_first_name)+1), ''))
```

Same treatment for `bookings_waiver_status` against `lesson_bookings`.

### Step 3 — Verify, then back-pocket data backfill

After the migration:

1. Re-run the diagnostic query that produced the table above and confirm Casey Turk, Amara Bola, Luca Batista, etc. now return `true`.
2. Spot-check the Mon/Wed roster count of "missing waiver" — should drop from ~31/40 to near-zero (only true unsigned cases remaining, e.g. Harfateh singh Bassi who has `col_says_signed = f`).

The underlying data bug (split-name columns mis-populated) should still be backfilled separately, but that is a data hygiene task and not required to unblock check-in today. The RPC fix above unblocks check-in immediately without touching any enrollment rows.

### Out of scope (per your instruction)

No changes to: `create-private-booking-setup`, booking/checkout flows, card reuse helpers/functions, `PrivateBookingFlow.tsx`, public lookup function, or feature flags.

### Technical details

- Migration touches three functions only: `swimmer_has_waiver_on_file`, `enrollments_waiver_status`, `bookings_waiver_status`.
- No schema changes, no RLS changes, no data writes.
- All three are `SECURITY DEFINER` with `search_path = public`; we keep that.
- Uniqueness-gate logic from today's change is preserved.
