## Plan: make the mobile calendar fully vertical

I’ll keep the desktop/tablet calendar grid unchanged and make the phone/PWA day view use only vertical stacking.

### What I’ll change

1. **Remove remaining mobile horizontal overflow in the day view**
   - Ensure the mobile branch never renders the timeline grid or any `overflow-x-auto` calendar columns.
   - Keep the existing stacked agenda grouped by time.

2. **Make agenda cards wrap instead of forcing width**
   - Replace truncation/nowrap behavior inside mobile cards with wrapping text.
   - Move counts/status like `3/3 swimmers` onto a second line when needed instead of pushing the card wider.
   - Add `min-w-0`, `break-words`, and full-width mobile-safe layout rules where long names/titles can overflow.

3. **Preserve all existing calendar features**
   - Tapping any item still opens the same detail panel.
   - Check-in, edit, delete, attendance refresh, instructor modal, filters, locked ICS items, and Add Event flow remain intact.
   - Desktop day/week views remain unchanged.

4. **Fix the surrounding mobile controls if needed**
   - Check the calendar filter chips, date navigation, week-day quick selector, and instructor chips for page-level overflow.
   - Convert any remaining horizontal-scroll-only mobile controls into wrapping or compact stacked rows where possible without removing buttons.

### Technical scope

- Primary file: `src/components/admin/calendar/CalendarDayView.tsx`
- Possible supporting file: `src/pages/admin/CalendarAdmin.tsx`
- No database or business logic changes.
- No changes to desktop layout beyond preserving current behavior.