## What I verified

### Annabelle Stamy

Enrollment row:
- `child_name = Annabelle Stamy`
- `child_first_name = NULL`
- `child_last_name = NULL`
- `child_dob = NULL`
- `parent_email = stamyfamily@gmail.com`
- current waiver check returns false

Signed waiver source:
- Found in `enrollment_agreements`
- `signer_email = stamyfamily@gmail.com`
- `signed_at = 2026-05-21`
- Not found as a `visitor_waivers.swimmers` JSONB row

### Flynn and Miles Grisby

Enrollment rows:
- Flynn Grisby: two confirmed enrollment rows, both missing split names and DOB
- Miles Grisby: two confirmed enrollment rows, both missing split names and DOB
- `parent_email = msjordynnterry@gmail.com`
- current waiver check returns false for both

Signed waiver source:
- Found in `enrollment_agreements`
- Flynn Grisby signed agreement exists, `signed_at = 2026-05-19`
- Miles Grisby signed agreement exists, `signed_at = 2026-05-19`
- Raw `visitor_waivers` JSONB search returned no Grisby rows

## Root cause

The current fix only added an email fallback for `visitor_waivers`.

But these families have waivers shown in Admin → Waivers with source `Enrollment`, which means the signed records are in `enrollment_agreements`, not `visitor_waivers`.

Because their enrollment rows also have `child_dob = NULL` and split name fields are NULL, the primary `last_name + dob` match cannot work. The fallback then only checks `visitor_waivers`, finds nothing, and incorrectly returns `false`.

## Fix plan

Update only the backend function `swimmer_has_waiver_on_file`.

No schema changes. No RLS changes. No data writes. No frontend changes.

### 1. Keep the primary match unchanged

Preserve the current preferred logic:

- last name
- DOB
- uniqueness-gated fuzzy first name
- across visitor waivers, enrollment agreements, and lesson bookings

This remains the safest path when DOB exists.

### 2. Extend the email fallback to all waiver sources

When the primary path finds no candidates and `parent_email` is present, gather candidate swimmer first names from:

1. `visitor_waivers`
   - `signer_email = parent_email`
   - explode `swimmers` JSONB array

2. `enrollment_agreements + swim_enrollments`
   - `a.enrollment_id = e.id`
   - `a.signed_at IS NOT NULL`
   - `e.parent_email = parent_email` or `a.signer_email = parent_email`
   - derive first name from split fields or `child_name`

3. `lesson_bookings`
   - `waiver_signed_at IS NOT NULL`
   - `parent_email = parent_email`
   - derive first name from split fields or `child_name`

### 3. Preserve the sibling safety gate

Use the existing rule after collecting candidates:

- If exactly one distinct first name exists for that email, allow fuzzy/prefix/Levenshtein matching.
- If multiple distinct first names exist, require exact first-name match.

This matters for Grisby because both Flynn and Miles are on the same parent email. Both should pass because their first names exactly match signed enrollment agreement rows, but another child on that email would not be auto-passed by fuzzy matching.

## Verification after migration

Run these checks immediately after applying the migration:

1. Annabelle Stamy direct RPC call → should return true.
2. Flynn Grisby direct RPC call → should return true.
3. Miles Grisby direct RPC call → should return true.
4. `enrollments_waiver_status` for those enrollment IDs → should return true for all matching rows.
5. Re-check Mon/Wed roster missing count → should drop by Stamy + Grisby rows and any other enrollment-agreement-only families with the same malformed enrollment pattern.
6. Confirm a known visitor-waiver success such as Casey Turk still returns true.
7. Confirm an actually unsigned family remains false.
