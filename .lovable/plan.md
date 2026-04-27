## Email Log Admin Page

Add a new admin page at `/admin/emails` that shows every email the system has sent, with filtering and search.

### What you'll see

**Summary cards (top of page)**
- Total emails
- Sent (green)
- Failed (red)
- Suppressed (yellow)
- Pending (gray)

Counts reflect the currently active filters.

**Filter bar**
- Time range: Last 24h / 7 days / 30 days / All time / Custom date range
- Template type: dropdown populated from distinct `template_name` values (e.g., `lesson-booking-confirmation`, `enrollment-confirmation`, `auth_emails`, etc.) — multi-select with "All" default
- Status: All / Sent / Failed / Suppressed / Pending
- Search box: filter by recipient email

Default view: All time, all templates, all statuses (no filters applied) — you'll see everything immediately, then narrow as needed.

**Email log table**
Columns:
- Timestamp (sortable, newest first by default)
- Template name (friendly label)
- Recipient email
- Status (color-coded badge)
- Error message (shown inline for failed/dlq rows, truncated with hover for full text)

Paginated at 50 rows per page with prev/next controls.

**Row actions**
- Click a row to expand and see full metadata (message_id, full error, JSON metadata payload)

### Where it lives

New sidebar entry **"Email Log"** under the existing admin nav, with a Mail icon, placed after "Announcements". Admin-only (uses existing `ProtectedRoute`).

### Technical notes

- New route `/admin/emails` → `EmailLogAdmin.tsx` page
- Queries the `email_send_log` table directly via the Supabase client
- **Deduplication**: a single email writes multiple rows (pending → sent/failed) sharing the same `message_id`. The query uses `DISTINCT ON (message_id)` ordered by `created_at DESC` so each email appears once with its latest status. Implemented as a Postgres view (`email_log_latest`) created via migration so the client query stays simple and indexed.
- RLS: `email_send_log` currently only allows `service_role` to read. Add a new policy allowing admins (`has_role(auth.uid(), 'admin')`) to SELECT — required so the admin UI can read logs directly without an edge function.
- Sidebar update in `AdminSidebar.tsx` to add the new menu item.
- Route registration in `App.tsx`.

### Files touched

- New: `src/pages/admin/EmailLogAdmin.tsx`
- New: `supabase/migrations/<timestamp>_email_log_view_and_policy.sql` (creates `email_log_latest` view + admin SELECT policy)
- Edit: `src/App.tsx` (add route)
- Edit: `src/components/admin/AdminSidebar.tsx` (add nav item)
