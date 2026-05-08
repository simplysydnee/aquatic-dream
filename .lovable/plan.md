## Goal
Make the swimmer detail tabs (Info, Enrollments & Lessons, Payments, Communications, Notes) fit on one row with a clearer, outlined look.

## Change
Single file: `src/components/admin/clients/SwimmerDetailDrawer.tsx` (lines 141–146).

**TabsList**
- Remove `flex-wrap h-auto` so triggers stay on one row.
- Make it span full width inside the drawer (`mx-6 mt-4` stays, drop `self-start`).
- Use a grid of 5 equal columns so each tab gets the same slice and labels stay readable: `grid grid-cols-5 w-auto`.
- Add an outlined container: `border border-border bg-background p-1 rounded-lg`.

**TabsTrigger (each)**
- Add an outlined inactive state and a strong active state for clear differentiation:
  - Base: `border border-transparent rounded-md text-muted-foreground`
  - Active (via shadcn data attr): `data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-sm`
- Shorten the long label to **"Enrollments (N)"** so all 5 fit comfortably at the drawer's width without truncation; keep the count.

## Notes
- No logic changes — purely presentational.
- Uses semantic tokens (`primary`, `border`, `muted-foreground`) per the design system, no hard-coded colors.
- Drawer is wide enough at standard desktop widths for 5 equal columns; on narrower screens the grid still keeps them on one row (text may shrink slightly, which is acceptable and matches the "one row" requirement).