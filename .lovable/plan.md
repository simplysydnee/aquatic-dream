## Goal
Make sure soft-held `pending_payment` seats count toward capacity everywhere — public AND admin — so no one (parent or owner) accidentally overbooks a class. Keep admin override behavior: warn, don't block.

## Audit results

**Already correct ✅**
- `get_session_enrollment_counts` RPC (public `SessionPicker`, `SwimLessons`) — includes `pending_payment`.
- `MoveSwimmerDialog.tsx` — counts every enrollment except `cancelled`, so pending_payment is included. Already shows "FULL" warning + override.

**Bugs to fix ❌**
1. `src/hooks/useCalendarData.ts:119` — admin calendar fetches only `status IN ('pending','confirmed')`. Pending-payment seats are invisible on the day view (the "2/3 swimmers" badge under-reports).
2. `src/pages/admin/ClassRosterAdmin.tsx:117` — same filter, same problem on the roster page.

## Fix

Change both queries to:
```ts
.in("status", ["pending", "confirmed", "enrolled", "pending_payment"])
```
This mirrors the RPC's allowlist exactly. One-line edits, no schema or UI changes.

## Admin Add Swimmer — soft warning

`AddSwimmerDialog.tsx` doesn't currently gate on capacity at all (it trusts the admin). After the fix above, the day-view roster card the admin clicks will already show the correct "3/3 swimmers" badge including pending_payment, so the visual warning is automatic.

No new modal or block — admin can still add over capacity if needed (same philosophy as MoveSwimmerDialog).

## Out of scope
- No DB migration.
- No change to public flow (already correct).
- No change to webhook, payment logic, or `status` enum.

## Verification
- Open Calendar day view → a session with 1 confirmed + 1 pending_payment should now show "2/3 swimmers" (was "1/3").
- Open Class Roster → same session shows 2 swimmers grouped.
- Public `/swim-enrollment` → unchanged (already counted via RPC).
