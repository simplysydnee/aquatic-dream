## Goal

Take the single uploaded image with all 5 swim level badges, split them into 5 transparent PNGs (one per level), and incorporate them into the app as a reusable component used in the most visible swim-curriculum spots.

## Step 1 — Split the badge image

Use Python (Pillow) to crop the uploaded image into 5 separate squares and remove the white background to transparent PNGs. Approximate crop layout (top row of 3, bottom row of 2 centered):

```text
[White: Little Fins] [Red: Reef Explorers] [Yellow: Sea Scouts]
        [Blue: Deep Sea Divers]  [Green: Ocean Masters]
```

Save to `src/assets/level-badges/`:
- `little-fins.png` (White / Preschool 1)
- `reef-explorers.png` (Red / Preschool 2)
- `sea-scouts.png` (Yellow / School Age 1)
- `deep-sea-divers.png` (Blue / School Age 2)
- `ocean-masters.png` (Green / School Age 3)

Each badge will be ~512×512, white pixels keyed to alpha so the circular badge sits cleanly on any background.

## Step 2 — Reusable `<LevelBadge />` component

Create `src/components/LevelBadge.tsx`:
- Props: `level: SwimLevel` (white | red | yellow | blue | green), `size?: number` (default 96), `className?: string`
- Imports the 5 PNGs as ES6 modules and maps `SwimLevel → image`
- Renders an `<img>` with proper `alt` (e.g. "Reef Explorers level badge") and rounded styling

This reuses the existing `SwimLevel` type from `src/components/swim-enrollment/types.ts`, so no new type system needed.

## Step 3 — Drop badges into the app

Three high-visibility placements (no layout rewrites — minimal swap-ins):

1. **Public Swim Lessons page** (`src/pages/SwimLessons.tsx`)
   - Replace the small color-dot/letter on each level card with the actual `<LevelBadge />` (~80px) above the level name.

2. **Enrollment Confirmation** (`src/components/swim-enrollment/EnrollmentConfirmation.tsx`)
   - Show the badge for the recommended/assigned level next to the "You're enrolled in…" headline (~120px hero size).

3. **Admin Class Roster headers** (`src/pages/admin/ClassRosterAdmin.tsx`) + **Session Enrollment Cards** (`src/components/admin/SessionEnrollmentCards.tsx`)
   - Small badge (~40px) next to each class group header so admins/instructors can visually scan rosters.

## Step 4 — Save brand memory

Add a `mem://brand/level-badges` entry recording the 5 badge file paths + which `SwimLevel` each maps to, and reference it from `mem://index.md`. Future requests will then auto-use the correct badge per level.

## Out of scope

- No changes to colors, copy, or business logic.
- Email templates stay text-only for now (badges can be added later once hosted on a public bucket).
- The existing `LEVEL_BADGE_COLORS` / colored dot styling stays intact as a fallback.

## Technical notes

- Pillow background-removal: convert to RGBA, set pixels with `R>240 & G>240 & B>240` to alpha=0, then crop on alpha bbox per badge tile.
- Vite handles `import badge from "@/assets/level-badges/little-fins.png"` natively — no config changes.
- Component is presentational only; no data fetching or state.
