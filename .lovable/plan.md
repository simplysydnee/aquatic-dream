# Fix: a parent's own held seat counted against them

## Problem

When the join page asks the backend for open class times, every live hold is counted as an occupied seat, including the hold belonging to the parent viewing the page. On a two seat slot (Adult Swim), a family member holding one of the two seats sees the slot as full.

## Fix

1. Open times function (`get-open-slots`)
   - Accept an optional `exclude_hold_token` in the request body.
   - When present, resolve it to a hold id via `membership_holds.token` and exclude that single hold row from the held count (`.neq("id", holdId)`).
   - Unknown or missing token: behavior unchanged.
   - Membership counting untouched.

2. Join page (`src/pages/JoinMembership.tsx`)
   - In `loadSlots()`, include `exclude_hold_token: holdToken` in the request body when `holdToken` is set, and add `holdToken` to the callback dependency list so the list refreshes if the token changes.

Nothing else changes: the capacity trigger, other edge functions, and all other call sites stay as they are.

## Verification

Against a capacity 2 slot with 1 active membership and 1 live hold:
- Call the function with no token: `spots_left` is 1 (the hold occupies the second seat).
- Call it with `exclude_hold_token` set to that hold's token: `spots_left` is 1 for the holder rather than 0.
- Call with a bogus token: same result as no token.
