## Problem

Today's private lessons aren't rendering on the admin calendar because the calendar fetch is returning HTTP 400:

```
column lesson_booking_occurrences.auto_charge_status does not exist
```

The actual column is `charge_status` (and `charge_error`). The code was renamed in the database but several files still reference the old `auto_charge_*` names, so the whole occurrences query fails and the `Private Lessons` panel renders empty.

Auto-generated `src/integrations/supabase/types.ts` already has the correct `charge_status` / `charge_error` on the `lesson_booking_occurrences` row type, so the rename is purely on the app side.

## Scope of the fix

Rename `auto_charge_status` → `charge_status` and `auto_charge_error` → `charge_error` only where they refer to the `lesson_booking_occurrences` table. Do NOT touch:

- `src/integrations/supabase/types.ts` (auto-generated; the one remaining `auto_charge_status` there is the return type of the `get_occurrence_by_cancel_token` RPC, which is a SQL alias and stays as-is)
- The database
- Any other column or behavior

## Files to edit

1. `src/hooks/useCalendarData.ts`
   - Line 109: rename interface field on `PrivateLessonBooking` (`auto_charge_status` → `charge_status`)
   - Line 203: change the `.select(...)` string to `charge_status` instead of `auto_charge_status`
   - Line 277: update the mapping that copies `o.auto_charge_status` to read `o.charge_status` and assign to the renamed field

2. `src/pages/admin/PrivateLessonsAdmin.tsx`
   - Local type at line 70: rename field
   - `.select(...)` strings at lines 123, 129, 1288: replace `auto_charge_status` with `charge_status` and `auto_charge_error` with `charge_error`
   - Read sites at lines 314, 850, 885, 955, 991, 1009, 1246: update property reads
   - Update payloads at lines 466, 532 that set `auto_charge_status: "skipped"` → `charge_status: "skipped"`

3. `src/components/admin/calendar/PrivateLessonDetailDialog.tsx`
   - Update payload at line 213: `auto_charge_status: "skipped"` → `charge_status: "skipped"`

## Verification

After the edits:

- Reload `/admin` and confirm the `lesson_booking_occurrences` request returns 200 instead of 400.
- Confirm the Private Lessons panel for today shows the 10 expected lessons (8 self-serve scheduled + 2 admin scheduled). The 7 stale `pending_card` self-serve rows are intentionally hidden by existing logic and should remain hidden.
- Spot-check `PrivateLessonsAdmin` (Card-on-file billing column, charge-now controls) to make sure the renamed reads still render and the "skipped" update still works.

## Out of scope

- No database changes, no RLS changes, no types.ts edits.
- No refactor of the calendar code path or `PrivateLessonsAdmin` layout.
- The `BookFromRequestDialog` / `useAvailableSlots` "no instructors scheduled" issue noted earlier is a separate item and not addressed here.
