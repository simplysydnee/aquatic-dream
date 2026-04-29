## Goal

Officially credit Starfish Aquatics Institute as our curriculum provider on the public website, including their logo (the uploaded shield).

## Step 1 — Save the logo

Copy `user-uploads://image-5.png` to `src/assets/starfish-aquatics-logo.png` so it can be imported as an ES6 module and bundled by Vite.

## Step 2 — Reusable credit component

Create `src/components/StarfishCurriculumBadge.tsx`:
- Renders the Starfish Swimming logo + short text: **"Proudly teaching the Starfish Aquatics Institute curriculum — Swim Lessons Save Lives."**
- Props: `variant?: "inline" | "stacked" | "compact"` and `className?`
- `inline` (default): logo ~64px on the left, text on the right
- `stacked`: centered logo ~96px above centered text (for hero/feature sections)
- `compact`: small logo ~32px + one-line text (for footer)

## Step 3 — Place it in three high-visibility spots

1. **Public Swim Lessons page** (`src/pages/SwimLessons.tsx`)
   - Add a `stacked` badge near the top of the curriculum/levels section (right above the existing "Five progressive groups based on the Starfish Aquatics system" copy on line ~364), so the logo visually anchors the curriculum explanation.

2. **Home page** (`src/pages/Index.tsx`)
   - Add an `inline` badge near the existing "Starfish Aquatics curriculum" mention (~line 125) inside the swim-lessons feature block.

3. **Footer** (`src/components/Footer.tsx`)
   - Add a `compact` badge in the footer so it appears site-wide as a trust signal.

## Step 4 — Memory

Update `mem://brand/positioning` (or add a small `mem://integrations/starfish-aquatics` note) recording:
- We are a Starfish Aquatics Institute curriculum partner
- Logo lives at `src/assets/starfish-aquatics-logo.png`
- Always pair logo with the line "Swim Lessons Save Lives"

## Out of scope

- No changes to the 5 group badges or LevelBadge component.
- No claims of certification beyond "teaching the Starfish Aquatics Institute curriculum" (safe, accurate phrasing). If you want stronger language ("Certified SwimAmerica provider", "StarGuard facility", etc.), say the word and I'll adjust.
- No changes to email templates.

## Technical notes

- The uploaded logo has a transparent-friendly white interior; it will sit cleanly on light backgrounds. On dark backgrounds (footer, if dark) we'll wrap it in a subtle white rounded container with small padding.
- Image will be imported via `import starfishLogo from "@/assets/starfish-aquatics-logo.png"` — no public/ asset, no direct URL.
- Alt text: `"Starfish Aquatics Institute curriculum partner"`.
