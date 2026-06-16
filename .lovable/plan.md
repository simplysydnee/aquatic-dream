
# Remove out-of-scope features

No DB changes. No edits to `src/integrations/supabase/types.ts`. No replacement pages.

## 1. Delete page files
- `src/pages/admin/TimeOffAdmin.tsx`
- `src/pages/admin/TimesheetsAdmin.tsx`
- `src/pages/admin/ScheduleAdmin.tsx`
- `src/pages/admin/JobApplicationsAdmin.tsx`
- `src/pages/admin/JobPostingsAdmin.tsx`
- `src/pages/admin/AnnouncementsAdmin.tsx`
- `src/pages/admin/DiveBookingsAdmin.tsx`
- `src/pages/admin/TripReservationsAdmin.tsx`
- `src/pages/instructor/InstructorTimeClock.tsx`
- `src/pages/instructor/InstructorTimeOff.tsx`
- `src/pages/instructor/InstructorMySchedule.tsx`
- `src/pages/instructor/InstructorOpenShifts.tsx`
- `src/pages/instructor/InstructorAvailability.tsx`
- `src/pages/instructor/InstructorAnnouncements.tsx`
- `src/pages/Careers.tsx`

## 2. Delete component files
- `src/components/admin/schedule/PositionsManager.tsx` (and empty `schedule/` dir)
- `src/components/careers/JobApplicationForm.tsx` (and empty `careers/` dir)

## 3. Delete edge function
- `supabase/functions/notify-schedule-published/` (also call `supabase--delete_edge_functions`)

## 4. Trim `src/pages/admin/ReportsAdmin.tsx`
- Keep only "No-shows" and "Enrollments" tabs.
- Remove all shifts/time_clock_entries queries, derived state, and Hours/Schedule tabs.
- Keep `Punch` and `SwimSession` types only if still referenced; otherwise remove.
- Set `<Tabs defaultValue="noshows">`.

## 5. Trim hooks
- `src/hooks/useAdminBadgeCounts.ts`: drop `newApplications` field and its `job_applications` query.
- `src/hooks/useAvailableSlots.ts`: remove `shifts` query and `hasAnyShift`; return empty `slots` with `loading=false`.

## 6. Clean `src/App.tsx`
- Remove imports and routes for every deleted page.
- Instructor portal: keep only `<Route index element={<InstructorMyRoster />} />`.

## 7. Clean `src/components/admin/AdminSidebar.tsx`
- Remove nav items for deleted admin pages.
- Remove `newApplications` from badge-count destructure.
- Remove now-unused icon imports.

## 8. Clean `src/pages/instructor/InstructorLayout.tsx`
- Keep only "My Rosters" NavLink.
- Remove `unread` state, announcement fetch `useEffect`, realtime subscription, unused icon imports.

## 9. Clean `Navbar.tsx` and `Footer.tsx`
- Remove `/careers` links from both.

## Deliverable
After execution, post a summary listing every file deleted and every file modified.
