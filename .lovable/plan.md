

# Job Applications Admin — Viewed/Archived Workflow

## Summary

Add two new columns to `job_applications` (`is_viewed` and `is_archived`) and update the admin UI with filtering tabs, a viewed indicator, and archive/unarchive actions.

## Database Migration

Add two columns to `job_applications`:
- `is_viewed` (boolean, default false) — marks whether admin has opened/reviewed the application
- `is_archived` (boolean, default false) — allows archiving past applicants

## UI Changes (JobApplicationsAdmin.tsx)

1. **Filter tabs** at the top: "Active" (default, `is_archived = false`), "Hired", "Archived" — lets you quickly switch between views
2. **Viewed indicator**: Unviewed applications show a blue dot or bold styling. When you click the eye icon to view details, the app automatically marks `is_viewed = true`
3. **Archive button**: Each row gets an archive icon button. Clicking it sets `is_archived = true` and removes the application from the active view. In the "Archived" tab, a button to unarchive
4. **Hired tab**: Filters to only `status = 'hired'` for quick review of your team

## How It Works

- Opening the detail dialog auto-marks the application as "viewed"
- The active tab hides archived applications so the list stays clean
- You can always find past applicants under the Archived tab
- No data is deleted — archive is just a soft filter

