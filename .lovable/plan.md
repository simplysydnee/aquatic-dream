# Mobile UX polish — Admin Calendar + Swimmer Drawer

Goal: make the PWA much nicer to use on a phone (390px viewport). No buttons, actions, or data flows are changed — only layout, density, and presentation react to mobile breakpoints. Desktop view stays exactly as it is today.

## Scope

1. `src/components/admin/calendar/CalendarDayView.tsx` — reduce vertical scrolling and column squish on phones.
2. `src/components/admin/clients/SwimmerDetailDrawer.tsx` — fix the cramped 5-tab strip and oversized padding so the drawer is usable on small screens.
3. `src/pages/admin/CalendarAdmin.tsx` — small responsive tweaks to the toolbar/legend so the day view actually has room above the fold.

We'll detect mobile with the existing `useIsMobile()` hook (`src/hooks/use-mobile.tsx`, breakpoint 768px). All changes are guarded — desktop renders exactly as before.

---

## 1. Calendar Day View — less scrolling, less squish

Current pain on mobile:
- `HOUR_HEIGHT = 80px` × 13 hours = 1040px of timeline before any block content.
- 4+ columns (ICS instructors + AD session columns + Dive) compressed into 390px = ~70px each, blocks become unreadable.
- Group headers, legend, filter bar, week-day strip all stack above the grid → grid starts well below the fold.

Mobile-only changes inside `CalendarDayView`:

- **Tighter vertical density**: `HOUR_HEIGHT` becomes `48` on mobile (still readable, ~37% less scroll). Recompute `TOTAL_HEIGHT` from the active value.
- **Sticky time-of-day header**: the group-headers row + column-labels row become `sticky top-0 z-20` inside the scroll container so context never disappears when scrolling 8+ hours.
- **Sticky "now" jump**: small floating "Now" pill (bottom-right of the grid) on mobile that scrolls back to the current hour. Reuses the existing scroll logic.
- **Horizontal column scroll instead of squish**: when there are >2 columns on mobile, the columns area gets `overflow-x-auto` with each column pinned to a min-width (~140px). Time gutter stays sticky-left. This keeps every block legible at the cost of a horizontal swipe — much better than today's unreadable 60px columns.
- **Condensed group header**: on mobile, the AD header chips collapse to a single line ("3 classes · 12 swimmers · 2 lessons") instead of wrapping into 3 lines.
- **Block content**: hide the 10px subtitle line on mobile when block height < 40px (already partially done at 32px) and shrink label to `text-[11px]` so names don't truncate as aggressively.

## 2. CalendarAdmin toolbar/legend — give the grid room

In `src/pages/admin/CalendarAdmin.tsx`:

- **Toolbar**: on mobile, hide the "ICS: Airtable / Switch to New DB" badge+button behind a small overflow menu (kebab) so the top row only shows Today + Add Event. Functionality unchanged.
- **Legend row**: collapsed by default on mobile behind a "Legend" disclosure (`<Collapsible>`). Tapping expands the same chips.
- **Filter bar**: already chip-based; just ensure it scrolls horizontally (`overflow-x-auto`, `flex-nowrap`) on mobile rather than wrapping to 3 lines.
- **Week-day quick selector**: keep as-is (already horizontal-scroll friendly), just reduce its vertical padding on mobile.

Net effect: ~150px reclaimed above the calendar grid.

## 3. Swimmer Detail Drawer — usable on a phone

Current pain:
- Sheet is `w-full sm:max-w-xl` so on mobile it's full-width — good. But:
- 5 tabs in a `grid-cols-5` row at 390px = ~66px per tab → "Communications" and "Enrollments (12)" wrap or clip.
- Header `p-6` + tabs `mx-6 mt-4` + content `p-6` eats most of the screen before any data.
- The 3-up "Lifetime" stat cards are fine, but the Parent/Swimmer sections stack with lots of whitespace.

Mobile-only changes:

- **Header**: `p-4` instead of `p-6`. Title row already wraps; keep edit button inline. Status badges drop below cleanly.
- **Tabs strip**: on mobile, switch to a horizontally scrollable `flex` row (`overflow-x-auto`, `whitespace-nowrap`) with shorter labels: `Info · Activity (N) · $ · Comms · Notes`. Keeps all 5 tabs reachable, no clipping. Active tab styling unchanged.
- **Tab content padding**: `p-4` instead of `p-6` on mobile.
- **Overview tab**:
  - Swimmer + Parent sections become a single 2-column grid on mobile (`grid-cols-2 gap-3`) with smaller labels — gets both above the fold.
  - Lifetime stat cards: keep 3-up but reduce padding (`p-2`) and number to `text-xl`.
  - Siblings list: keep as-is, already touch-friendly.
- **Activity tab cards**: tighter padding (`p-2.5`), date moves inline with title via `text-[10px]`, "Open →" becomes a full-row tap target (whole card clickable when `onClick` exists) so users don't need to hit the small link.
- **Payments / Comms / Notes tabs**: only padding tightened; internal components unchanged.

No tab is removed, no button is removed, no behavior changes. Edit dialog, sibling switching, and all existing handlers are preserved.

## Out of scope

- No changes to data fetching, auth, payments, or any business logic.
- No changes to the desktop layout (everything is gated on `useIsMobile()`).
- No changes to the week view (only the day view is the heavy mobile case the user is on).
- No PWA / service-worker changes.

## Files touched

- `src/components/admin/calendar/CalendarDayView.tsx` — mobile density + sticky headers + horizontal column scroll + Now pill.
- `src/pages/admin/CalendarAdmin.tsx` — toolbar overflow, collapsible legend, scrollable filter bar.
- `src/components/admin/clients/SwimmerDetailDrawer.tsx` — scrollable tab strip, tighter padding, 2-col overview on mobile, tappable activity cards.

After implementation I'll verify at 390×844 in the preview and confirm desktop is unchanged.
