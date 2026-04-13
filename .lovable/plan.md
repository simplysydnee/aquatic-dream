

## Fix Swim Lessons Page: Curriculum & Schedule

### Problems Found

1. **Wrong color labels on curriculum cards**:
   - Sea Scouts shows "White / Red" — should be "Yellow"
   - Deep Sea Divers shows "Yellow" — should be "Blue"  
   - Ocean Masters shows "Green / Blue" — should be "Green"

2. **Curriculum not visually separated** by age group — all 5 cards shown in one flat grid. Should have clear "Preschool Program" and "School-Age Program" sections.

3. **Schedule section uses raw color names** ("Blue & Yellow") instead of group names (Sea Scouts, Deep Sea Divers). Confusing for parents.

4. **Schedule is hardcoded and duplicated** — same time slots copy-pasted for both sessions. Should pull live data from the database to show actual availability and correct session dates.

### Plan

**1. Fix curriculum data and separate into two sections** (`SwimLessons.tsx`)

Split the curriculum array into `preschoolCurriculum` (Bubble Makers, Reef Explorers) and `schoolAgeCurriculum` (Sea Scouts, Deep Sea Divers, Ocean Masters). Fix the color labels:
- Sea Scouts: color "Yellow", gradient yellow tones
- Deep Sea Divers: color "Blue", gradient blue tones  
- Ocean Masters: color "Green" (unchanged)

Render two distinct sections with headers: "Preschool Program (Ages 3–5)" and "School-Age Program (Ages 6–12)".

**2. Redesign the schedule section** (`SwimLessons.tsx`)

Replace hardcoded time slots with a database-driven schedule. Fetch active `swim_sessions` joined with `session_periods` to show real data grouped by session period. Display using group names instead of color names, and show spots remaining for each time slot.

Layout: Each session period gets a card. Within each card, times are grouped under "Preschool" and "School-Age" subheadings, showing the group name and time — e.g. "3:00 PM — Sea Scouts · 2 spots left".

### Files Modified
1. `src/pages/SwimLessons.tsx` — fix curriculum data, split into two program sections, replace hardcoded schedule with database-driven display

