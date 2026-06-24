## Diagnosis

The swimmer the user is trying to check in is **Arthur Sidell** (private lesson booking `13a988b9…`, parent `copemcj@gmail.com`, 3:30pm today).

CheckInAdmin gates the check-in button on `bookings_waiver_status(...).has_waiver`. For this booking it returns **false**, so the UI shows "Waiver missing" and pops the waiver dialog instead of checking him in.

A valid visitor waiver for Arthur **does exist**:
- visitor_waiver `29f38564…` signed 2026-06-08 by `copemcj@gmail.com`, swimmers: `[{first_name: "Arthur", last_name: "Sidell", dob: "2023-03-22"}]`.

Why the matching fails:

1. `lesson_bookings.child_dob` for this row is **NULL**, and `lesson_bookings.child_first_name` / `child_last_name` / `child_name` were saved with **extra whitespace** (`"Arthur  Sidell "` — double internal space, trailing space).
2. `bookings_waiver_status` only calls `swimmer_has_waiver_on_file` when first+last+**dob** are all present on the booking. With dob NULL it short-circuits to `false`.
3. The insert-time auto-linker `link_visitor_waiver` matches by `lower(trim(child_name))`. `trim()` removes leading/trailing spaces but not the internal double space, so `"arthur  sidell"` ≠ `"arthur sidell"` and no link/stamp happened.
4. `waiver_signed_at` on the booking is therefore NULL, and the on-file fallback never matches, so the check-in screen treats him as un-waivered.

The waiver itself is fine. The booking row is just dirty (whitespace + missing dob) so the matchers can't find it.

## Fix (two parts)

### 1. Immediate data fix (unblocks today's check-in)

One-row update on the booking, plus a link row so the waiver is correctly associated going forward:

- Normalize `child_first_name`, `child_last_name`, `child_name` (collapse internal whitespace, trim).
- Set `child_dob = 2023-03-22` from the visitor waiver swimmer entry.
- Set `waiver_signed_at = 2026-06-08 21:05:51+00` (visitor waiver's `signed_at`) so the existing check-in logic flips to "waiver on file".
- Insert into `visitor_waiver_links (visitor_waiver_id, lesson_booking_id, swimmer_name, matched_by='manual')` for auditability.

After this, `bookings_waiver_status` returns `has_waiver = true` and the check-in button works.

### 2. Hardening so this stops happening (small, surgical SQL)

Update two SECURITY DEFINER functions in a migration so future bookings with messy data still match:

- `swimmer_has_waiver_on_file(_first, _last, _dob)`: change the equality checks from `lower(trim(...))` to `lower(regexp_replace(trim(...), '\s+', ' ', 'g'))` on both sides so double spaces don't break matching. Keep the dob requirement.
- `link_visitor_waiver(_waiver_id)`: same whitespace-collapse normalization on the `_name` comparison so the insert-time auto-link catches bookings with stray spaces.

No schema changes, no RLS changes, no frontend changes. CheckInAdmin keeps reading from the same RPCs.

### Out of scope

- Not loosening the dob requirement in `bookings_waiver_status` (would risk false positives across unrelated swimmers with the same name).
- Not changing how bookings get created — the upstream form that allowed a double-space child_name and a null dob is a separate cleanup.
- No changes to enrollment flow, Stripe, RLS, or reminders.

## Verification

1. Re-run `bookings_waiver_status` for `13a988b9…` → expect `has_waiver = true`.
2. Refresh `/admin/check-in`, find Arthur Sidell at 3:30pm → "Waiver missing" badge gone, "Check in" works without the waiver dialog.
3. Spot-check `link_visitor_waiver` on the existing waiver to confirm the new normalization auto-links bookings with double-space names.