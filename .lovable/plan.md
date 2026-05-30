## Problem

On `/waivers`, when you pick a Month (or Day, or Year) from the dropdowns for a swimmer's date of birth, the selection visually reverts to the "Month" placeholder. Same for Day and Year until all three are chosen.

## Root cause

In `src/components/waivers/SwimmersCoveredFields.tsx`, the swimmer's DOB is stored as a single `YYYY-MM-DD` string on the `SwimmerCovered` object. The `joinDob(y, m, d)` helper returns an empty string unless **all three** parts are filled:

```ts
if (!y || !m || !d) return "";
```

So picking just Month writes `""` back to `s.dob`. On re-render, `splitDob("")` returns `{ y:"", m:"", d:"" }`, the `<Select value={m}>` becomes empty, and the trigger falls back to the "Month" placeholder. The user's choice is silently discarded.

## Fix

Preserve partial selections so each dropdown reflects what the user picked, while still only emitting a valid `YYYY-MM-DD` to downstream code once all three are filled.

Approach: track the three parts in component-local state (keyed by swimmer index), and only sync to `s.dob` when all three are present (otherwise clear `s.dob`). Initialize local state from `s.dob` so existing values still hydrate.

### Changes (single file)

**`src/components/waivers/SwimmersCoveredFields.tsx`**
1. Add a `useState<Record<number, { y: string; m: string; d: string }>>` for DOB parts.
2. On mount / when `swimmers` length changes, hydrate any missing entries from `splitDob(s.dob)`.
3. Replace the three `<Select>` `value` props to read from local parts state.
4. In each `onValueChange`, update local parts state, then call `update(idx, "dob", allThreeFilled ? "YYYY-MM-DD" : "")`.
5. Keep the existing `safeDay` clamping when month/year changes shrinks the month length.
6. No changes to `SwimmerCovered` type, parent components, validation, or submission payload.

## Out of scope

- No changes to validation rules, the edge function, or the visitor waiver submission flow.
- No styling changes beyond what's needed for the fix.
