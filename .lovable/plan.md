# Extract family search into a reusable hook

## Current behavior (verified in CreateMembershipHoldDialog.tsx, lines 102-224)

- Effect runs on every `query` change; queries shorter than 2 characters clear results.
- Builds `%query%` for text and, when the query has 3+ digits, an extra digits-only `%digits%` pattern for phone.
- Four parallel queries, each limited to 20 rows:
  - `memberships` (7 ilike ORs, ordered by `created_at` desc)
  - `lesson_bookings` (7 ilike ORs, ordered by `updated_at` desc)
  - `swim_enrollments` (7 ilike ORs, ordered by `updated_at` desc)
  - `lesson_requests` (5 ilike ORs on the single-field name columns, ordered by `created_at` desc)
- Rows with no swimmer name are dropped. Dedupe key is `email || phone || parentName` + lowercased swimmer name; first writer wins, merged in order membership, booking, enrollment, request.
- Results sorted so phone-digit matches rank first, then sliced to 12.
- A `cancelled` flag discards stale responses; a `searching` flag drives the spinner.

## What to build

New `src/hooks/useFamilySearch.ts` holding all of the above verbatim, exporting the existing `FamilyMatch` type (and `SOURCE_LABELS` stays where the UI needs it).

Signature:

```text
useFamilySearch(query: string, options?: { groupByFamily?: boolean })
  -> { results: FamilyMatch[], families: FamilyGroup[], searching: boolean }
```

- `groupByFamily: false` (default): `results` is byte-for-byte the same list the dialog produces today, same dedupe, same ranking, same 12 cap.
- `groupByFamily: true`: after the same dedupe and ranking, collapse entries on normalized parent phone (digits only, leading US `1` dropped). Each `FamilyGroup` is `{ parent_name, parent_phone, parent_email, parent_emails: string[], source, swimmers: Array<{ swimmer_name, child_dob, parent_email, source }> }`. `parent_emails` holds every distinct lowercased email seen for the group, in first-seen order, so the roster can surface families with records under more than one address. Entries with no phone stay their own single-swimmer group keyed by lowercased email, then by parent name, so nothing is lost. The 12 cap applies to groups in this mode.
- Swimmer dedupe within a group (keyed on lowercased swimmer name): keep the entry with a non-null `child_dob`. If both or neither have a DOB, keep the one from the higher-priority source using the existing merge order membership, booking, enrollment, request. DOB drives the roster waiver lookup, so the entry carrying one always wins. The dropped entry's email still contributes to `parent_emails`.

`CreateMembershipHoldDialog` drops its effect, `results`/`searching` state, and the query-building code, and calls `useFamilySearch(query)` with grouping off. No change to its markup, `pick`, submit path, or `create-membership-hold`.

## Technical notes

- Phone normalization reuses the digits-only approach already in the file; `src/lib/phone.ts` stays display-only.
- The hook keeps the `cancelled` cleanup guard so out-of-order responses cannot overwrite newer results.
- No database, edge function, or RLS changes.

## Verification

1. Search in the hold dialog by phone, name, and email; confirm identical ordering, labels, and that creating a hold still works.
2. Exercise the hook with `groupByFamily: true` and confirm one entry per phone with a populated `swimmers` array.
3. Confirm a swimmer listed under two parent emails sharing one phone collapses into a single family with a single swimmer entry.
