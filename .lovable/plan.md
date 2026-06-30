
## Root cause (verified)

The remaining 24 "missing waiver" enrollments fall into two camps:

1. **Real signed waivers exist** but the enrollment row has `child_dob = NULL` and/or `child_last_name = NULL`, so the strict `last_name + dob` bind in `swimmer_has_waiver_on_file` has nothing to anchor on. Verified examples: Kooner trio, Singh siblings, Karim sisters, Olive Dompeling, Damian Castro.
2. **No waiver on file** at all (genuinely unsigned): Abbie Cortes, Alfredo Tejeda, Annabelle Stamy, Caden Kersten, Eliza Montes, Emily Berdion, Flynn Grisby, Gurshaan Ghuman, Harfateh singh Bassi, John Poses, Levi Kersten, Miles Grisby, Paloma, Reet Ghuman, Sophia Torres.

Multi-swimmer JSONB handling in the function is correct — `CROSS JOIN LATERAL jsonb_array_elements(w.swimmers)` visits each sibling independently. Verified with the Kooner waiver (3 siblings on one row, all surface) and Singh/Karim sibling pairs.

## Proposed fix

Add a third match path to `swimmer_has_waiver_on_file` that uses `parent_email` to bind a waiver to a swimmer when `dob`/`last_name` are missing on the enrollment side. Keep the existing strict path as the primary; the email fallback only fires when the primary path can't bind.

### New match logic (in priority order)

1. **Primary (unchanged):** `last_name + dob` match, with uniqueness-gated fuzzy first name. Wins whenever it can.
2. **New fallback — email bind:** if `_parent_email` is provided, look at `visitor_waivers` rows where `lower(signer_email) = lower(_parent_email)` signed within the last year, explode `swimmers`, and apply the same uniqueness-gated fuzzy first-name match against that scoped set. No DOB or last_name required on the enrollment side, because the parent's verified email already binds the waiver to the family.

This is safe because:
- `visitor_waivers.signer_email` is captured at sign time and reliable.
- The match is still gated by **first name within the same family's waiver**, so we can't accidentally cross-match Devi Singh's waiver to Ishaan Singh's enrollment unless both are listed on the same waiver row (which is the correct behavior).
- Uniqueness gate is preserved: if the parent's waiver lists multiple first names, fuzzy matching is disabled and only exact first-name matches return true.

### Resilience extensions

The same email fallback is applied inside `enrollments_waiver_status` and `bookings_waiver_status` automatically because they call `swimmer_has_waiver_on_file` and already pass `parent_email`.

## What this fixes

Expected to flip these enrollments from `false` to `true` (real signed waivers exist):
- Devi Singh, Ishaan Singh (parent sbaker1207@gmail.com)
- Himmat / Kehar / Mehtab Kooner (parent navikmann28@att.net)
- Livia / Miabella Karim (parent imeldakarim771@gmail.com)
- Olive (parent leahdompeling@gmail.com)
- Damian Castro (parent yybbrr88@yahoo.com — DOB typo in enrollment, email matches)

That takes Mon/Wed roster from 24 missing to ~16 missing. The remaining 16 are genuinely unsigned (no waiver row found by name in any source) — those are a real "ask the parent to sign" list, not a code bug.

## What this does NOT touch

- No schema changes.
- No RLS changes.
- No data writes / no backfills of enrollment rows.
- No changes to booking, checkout, card reuse, `PrivateBookingFlow`, or any feature flag.
- `bookings_waiver_status` and `enrollments_waiver_status` signatures unchanged.
- Strict name+dob path remains the primary; email fallback is additive.

## Technical detail

Single migration that replaces `swimmer_has_waiver_on_file` with the same signature. Inside the function:

```text
1. normalize first/last (existing)
2. build candidate first-name set via UNION across three sources
   keyed on (last_name + dob) — existing primary path
3. if primary set is empty AND _parent_email is not null:
     build candidate set from visitor_waivers where
     lower(signer_email) = lower(_parent_email)
     AND signed_at >= now() - interval '1 year'
     explode swimmers JSONB; keep distinct first_names
4. apply existing uniqueness gate + fuzzy first-name rule to whichever
   candidate set produced rows
```

`enrollments_waiver_status` and `bookings_waiver_status` are left as-is — they already pass `parent_email` through.

## Verification after deploy

1. Re-run `enrollments_waiver_status` on the 24 missing roster IDs; confirm Kooner trio, Singh pair, Karim pair, Olive, and Damian Castro flip to `true`.
2. Confirm none of the previously-`true` Mon/Wed enrollments regress.
3. Spot check a known-unsigned name (e.g. Abbie Cortes) still returns `false`.
4. Produce the final list of genuinely unsigned swimmers for staff to chase.
