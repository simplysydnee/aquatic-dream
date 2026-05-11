## Goal
Eliminate page-level horizontal scrolling across the admin mobile experience, especially Calendar, Class Roster, Swim Enrollments, Clients/Swimmers, and other admin data pages, while preserving desktop functionality.

## What I found
- Many admin pages still render desktop tables on mobile. The shared table wrapper scrolls internally, but repeated wide columns, fixed `w-[...]` controls, badges, and long emails/names create spillover and poor mobile UX.
- Swim Enrollments is the biggest offender: metric cards, tab list, filter row, and 10+ column tables are not mobile-first.
- Class Roster uses cards, but each roster card contains a table and header controls that can overflow on phones.
- Clients/Swimmers is closer, but long emails/status badges and the drawer tabs/content can still force width pressure.
- Calendar day view has a stacked mobile agenda, but some text and action/header groups still need stricter max-width/min-width handling.
- Several secondary admin pages use similar table patterns: Lesson Requests, Contacts, Instructors, Job Applications/Postings, Email Log, Time Off, Timesheets, and Schedule.

## Implementation plan
1. **Add reusable mobile-safe admin primitives**
   - Create small shared components/classes for:
     - responsive admin page headers
     - mobile filter stacks
     - mobile record cards
     - desktop-only tables with mobile card alternatives
   - Keep desktop table layouts intact for tablet/desktop.

2. **Fix Swim Enrollments mobile layout**
   - Make summary cards one-column or compact two-column on narrow phones without text spill.
   - Convert the tab list to a full-width responsive grid instead of a horizontal tab strip.
   - Stack filters vertically on mobile with full-width inputs/selects.
   - Replace the All Enrollments and Cancelled tables on mobile with compact enrollment cards showing child, parent, session, payment statuses, date, and actions.
   - Keep the current tables for desktop.

3. **Fix Class Roster mobile layout**
   - Make filter selects full-width/stacked on mobile.
   - Rework each session card header so title, badges, instructor selector, and capacity wrap cleanly.
   - Replace the roster table inside each card with stacked swimmer rows on mobile.
   - Keep table layout on desktop.

4. **Fix Clients/Swimmers mobile layout**
   - Ensure search/filter controls never exceed the viewport.
   - Clamp/wrap long emails, parent names, badges, and last-activity metadata.
   - Make swimmer detail drawer tabs and content use strict `min-w-0`, wrapping, and mobile-safe widths.

5. **Fix Calendar remaining mobile overflow**
   - Tighten the mobile agenda cards so long swimmer names, coach names, and time labels wrap inside cards.
   - Constrain instructor chips/filter chips and date controls to the viewport.
   - Preserve the stacked time-based mobile calendar and all click/detail actions.

6. **Sweep secondary admin pages**
   - For pages with tables (Lesson Requests, Contacts, Instructors, Job Applications/Postings, Email Log, etc.), add mobile card views or responsive wrappers where needed.
   - For pages with tabs (Time Off, Reports, Job Applications), convert tab lists to mobile grid/wrap layouts.
   - For scheduling pages that must remain wide, contain the horizontal scroll inside the schedule card only and prevent the whole page from scrolling sideways.

7. **Verify on phone viewport**
   - Test the main mobile routes at 390px width:
     - `/admin`
     - `/admin/enrollments`
     - `/admin/roster`
     - `/admin/clients`
     - `/admin/lesson-requests`
     - `/admin/contacts`
     - `/admin/instructors`
     - `/admin/schedule`
   - Confirm `documentElement.scrollWidth <= window.innerWidth` for normal pages, and for intentionally wide schedule grids confirm only the inner grid scrolls.