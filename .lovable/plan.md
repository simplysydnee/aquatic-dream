

## Fix: Stop Merging White & Red on Sessions Page

### Problem
`SessionsAdmin.tsx` has a `COMBINED_GROUPS` map that forces "Bubble Makers" and "Reef Explorers" into one combined subgroup header. This makes it look like they're one class when they're actually two separate classes with independent capacities. The Class Roster correctly shows them separately.

### Fix (single file: `SessionsAdmin.tsx`)

**Remove the COMBINED_GROUPS logic entirely:**
- Delete the `COMBINED_GROUPS` map (lines 107-110) and `getDisplayGroup` function (line 111)
- In the grouping loop (line 402), use `s.session_name` directly instead of `getDisplayGroup(s.session_name)`
- This makes each level its own subgroup with its own capacity display — matching the Roster page exactly

### Result
- White ("Bubble Makers") and Red ("Reef Explorers") appear as separate subgroups on the Sessions page
- Each shows its own capacity (e.g., 0/3) independently
- Sessions page and Class Roster page now show the same structure

