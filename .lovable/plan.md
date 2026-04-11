

## Fix Class Structure: Correct Levels Per Time Slot + Update Group Names

### Problem

The database currently has **5 levels at every school-age time slot** (white, red, yellow, blue, green) and uses group names like "Sea Scouts" for school-age white/red. The owner clarified:

- **School-age slots should NOT have white or red levels** — only yellow + blue (or yellow + green for the last two evening slots)
- Each level is its own independent class with **3 max capacity per level** (not shared across levels)
- Preschool is correct: white + red at each slot
- **Group names need updating** to match the owner's naming convention

### What's Changing

**1. Database cleanup — delete wrong session rows**
- Delete all school-age `white` and `red` session rows — roughly 28 rows
- Delete school-age `green` sessions at the first 6 time slots (3:00, 3:30, 4:00, 4:30, 5:00, 5:45) — roughly 12 rows
- Delete school-age `blue` sessions at the last 2 time slots (6:15, 6:45) — roughly 4 rows
- Delete orphaned `session_lesson_dates` for removed sessions

**2. Update types.ts — fix group names and remove school-age white/red**

Updated group name mapping:

| Level | Old Name | Correct Name |
|-------|----------|-------------|
| White (preschool) | Bubble Makers | **Bubble Makers** (no change) |
| Red (preschool) | Reef Explorers | **Reef Explorers** (no change) |
| Yellow | Deep Sea Divers | **Sea Scouts** |
| Blue | Ocean Masters | **Deep Sea Divers** |
| Green | Ocean Masters | **Ocean Masters** (no change) |

- Update `LEVEL_DISPLAY` record: yellow groupName → "Sea Scouts", blue groupName → "Deep Sea Divers"
- Update `getGroupName()` function: yellow → "Sea Scouts", blue → "Deep Sea Divers", green → "Ocean Masters"
- Remove school-age white/red cases ("Sea Scouts" / "Surface Support" for those levels)
- School-age levels are now only: yellow (Sea Scouts), blue (Deep Sea Divers), green (Ocean Masters)

**3. Update SwimAssessment.tsx — fix school-age level recommendations**
- If a school-age child (6-12) answers "no" to submerge or float, recommend **yellow** instead of white/red
- Assessment tree for school-age: no submerge → yellow, no float → yellow, no tread → yellow, no side-roll → blue, yes all → green

**4. Update SessionPicker.tsx — simplify slot grouping**
- Remove the `levelCompatible` function that assumed preschool shares all levels
- Group time slots properly: each slot shows available sessions for the child's recommended level
- Capacity is per-level (3 per level), not shared across the whole time slot

**5. SessionsAdmin.tsx + ClassRosterAdmin.tsx**
- Both read dynamically from `swim_sessions` and use the shared types — should reflect DB and naming changes automatically
- No code changes expected

### Files Affected

| Action | File/Target |
|--------|-------------|
| DB delete | Remove ~44 incorrect `swim_sessions` rows + their `session_lesson_dates` |
| Modify | `src/components/swim-enrollment/types.ts` — update group names, remove school-age white/red |
| Modify | `src/components/swim-enrollment/SwimAssessment.tsx` — cap school-age minimum at yellow |
| Modify | `src/components/swim-enrollment/SessionPicker.tsx` — simplify level filtering |

### Expected Result
- **Preschool slots**: 2:45, 3:15, 3:45, 4:15, 4:45, 5:30, 6:00, 6:30 — each with White (3) + Red (3)
- **School-age slots**: 3:00, 3:30, 4:00, 4:30, 5:00, 5:45 — each with Yellow (3) + Blue (3)
- **School-age evening**: 6:15, 6:45 — each with Yellow (3) + Green (3)
- Group names everywhere: Bubble Makers, Reef Explorers, Sea Scouts, Deep Sea Divers, Ocean Masters
- Admin sessions page, class roster, and enrollment booking all reflect this automatically

