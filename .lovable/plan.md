## Problem
The "Pick existing client…" dropdown in the private/semi-private lesson form only queries `swim_enrollments`, so families that filled out the lesson interest survey (`lesson_requests`) or already have a private/semi-private booking (`lesson_bookings`) don't show up.

## Plan
Update `src/components/admin/calendar/LessonBookingFields.tsx` to load clients from all three sources and merge them into one deduplicated list.

1. In the loader `useEffect`, run three parallel queries:
   - `swim_enrollments` — parent_name, parent_email, parent_phone, child_name
   - `lesson_requests` — same fields (interest survey)
   - `lesson_bookings` — same fields (existing private/semi clients)
2. Merge into a single array, dedupe by `parent_email|child_name` (lowercased + trimmed), preferring the most recent non-empty values for parent_name/phone.
3. Add a small `source` tag (Enrolled / Inquiry / Booking) shown as a muted badge in each row so the front desk knows where the contact came from.
4. Sort: bookings first, then enrollments, then inquiries; within each, alphabetical by child name.
5. Keep the existing Command search behavior — `value` string already contains parent + child + email so the new entries are searchable.

No schema or backend changes required; all three tables are already readable by authenticated admins.
