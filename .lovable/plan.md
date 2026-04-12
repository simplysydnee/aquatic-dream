

## Fix: Assessment Labels Mismatch for School-Age Levels

### The Problem
When a school-age child (6-12) answers "No" to the first question, they get placed in Yellow level showing **"Sea Scouts — Yellow Level — Intermediate"**. But per the curriculum on the Swim Lessons page, Sea Scouts is **School Age 1 — Beginner**. The labels are wrong because `getDiveStatus()` doesn't account for age group when assigning school-age labels.

The curriculum defines:
- Sea Scouts = School Age 1 = **Beginner** (ages 6-12)
- Deep Sea Divers = School Age 2 = **Intermediate** (ages 6-12)
- Ocean Masters = School Age 3 = **Advanced** (ages 6-12)

But `types.ts` currently returns: Yellow=Intermediate, Blue=Advanced, Green=Expert.

### Changes

**1. `src/components/swim-enrollment/types.ts`** — Fix `getDiveStatus()`:
```
Yellow (school-age) → "Beginner"     (was "Intermediate")
Blue   (school-age) → "Intermediate" (was "Advanced")
Green  (school-age) → "Advanced"     (was "Expert")
```
No changes needed to `getGroupName()` — it already returns the correct group names.

**2. `src/components/swim-enrollment/SwimAssessment.tsx`** — Update result card:
- Replace `{levelInfo.name} Level` (e.g. "Yellow Level") with age-appropriate label: **"School Age 1"** / **"School Age 2"** / **"School Age 3"** for school-age, keep **"Preschool 1"** / **"Preschool 2"** for preschool
- Add a small age range badge (e.g. "Ages 6-12") below the level name for clarity

**3. `src/components/swim-enrollment/EnrollmentConfirmation.tsx`** — Same label update on the confirmation card so it says "School Age 1" instead of "Yellow Level"

**4. Admin views** — `EnrollmentDetailDialog.tsx`, `SwimEnrollmentsAdmin.tsx`, `SessionEnrollmentCards.tsx` all use `getGroupName()` which is already correct. No changes needed there since they show group names (Sea Scouts, etc.) not the raw color level labels.

### New helper function in `types.ts`
Add a `getLevelLabel(level, ageGroup)` function:
```typescript
export function getLevelLabel(level: SwimLevel, ageGroup: AgeGroup): string {
  if (ageGroup === "preschool-3-5") {
    return level === "white" ? "Preschool 1" : "Preschool 2";
  }
  if (level === "yellow") return "School Age 1";
  if (level === "blue") return "School Age 2";
  return "School Age 3";
}
```

### No database changes needed
The database stores the color level (white/red/yellow/blue/green) which is correct. The fix is purely display-side.

### Files Modified
1. `src/components/swim-enrollment/types.ts` — fix `getDiveStatus()`, add `getLevelLabel()`
2. `src/components/swim-enrollment/SwimAssessment.tsx` — use `getLevelLabel()` and show age range
3. `src/components/swim-enrollment/EnrollmentConfirmation.tsx` — use `getLevelLabel()` for consistency

