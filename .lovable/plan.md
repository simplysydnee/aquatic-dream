## Reorganize Admin Sidebar into Collapsible Groups

Restructure the admin sidebar from one flat list of 17 items into 6 collapsible, scannable groups so admins/staff always know where to look.

### New Group Structure

**Operations** (daily-use items)
- Calendar
- Class Roster
- Announcements

**Clients & Inquiries**
- Clients
- Swim Enrollments
- Lesson Requests (badge)
- Contact Inquiries (badge)

**Programs**
- Sessions
- Reports

**Staff**
- Instructors
- Schedule
- Time Off & Trades
- Timesheets

**Hiring**
- Job Postings
- Applications (badge)

**System**
- Email Log
- User Management

### Behavior

- **Collapsible groups**: Each group header is a clickable chevron toggle (shadcn `Collapsible` inside `SidebarGroup`).
- **Auto-expand active group**: On load, the group containing the current route opens automatically.
- **Persisted state**: Open/closed state per group saved to `localStorage` (`admin-sidebar-groups`) so it survives reloads.
- **Bubble-up badges**: When a group is collapsed, sum of child badges (e.g., new Lesson Requests + new Contacts) appears as a single red pill on the group header.
- **Icon-collapsed sidebar**: When the entire sidebar is icon-collapsed, group labels hide and items render as a flat icon list (current behavior preserved), with red dot indicators for any badge.
- **Active route**: Highlighted as today.

### Files

- Edit `src/components/admin/AdminSidebar.tsx` — replace the flat `items` array with a `groups` array, render each as a `Collapsible` `SidebarGroup`, add localStorage persistence, auto-expand based on `useLocation`, compute bubble-up badge sums.

No database, route, or other component changes needed.
