

## Plan: Instructors Page, Session Management, and Roster Color-Coding

Keep all existing swim sessions, groups, ages, and schedule data exactly as they are. Build new admin tools on top.

---

### 1. Database migration

- **Create `instructors` table**: `id` (uuid PK), `name` (text, required), `email` (text), `phone` (text), `is_active` (boolean, default true), `created_at`, `updated_at`
- **Add columns to `swim_sessions`**: `instructor_id` (uuid, nullable FK to instructors), `registration_status` (text, default `'open'` — values: open, closed, archived)
- RLS: public can SELECT instructors, authenticated can manage all

### 2. Instructors admin page (`/admin/instructors`)

- Table listing all instructors: name, email, phone, active status
- "Add Instructor" dialog with name (required), email, phone
- Edit and deactivate/reactivate actions per row
- Add route in `App.tsx` and sidebar entry in `AdminSidebar.tsx`

### 3. Session Management admin page (`/admin/sessions`)

- List all sessions grouped by session name, showing time, level, age group, capacity, instructor, open/closed
- **"Create Session" dialog** with:
  - Session name, start/end dates
  - Days of week (checkboxes)
  - Start/end time, swim level, age group, max students
  - Instructor (optional dropdown from instructors table)
  - Status: Open / Closed
- Edit session, toggle open/closed inline, duplicate session
- Add route and sidebar entry

### 4. Color-code the Class Roster page

- **Level badges**: Use existing `LEVEL_BADGE_COLORS` — White=gray, Red=red, Yellow=yellow, Blue=blue, Green=green backgrounds
- **Age group badges**: Preschool=purple tint, School-Age=teal tint
- **Colored left border** on each session card matching the primary level color
- **Instructor display**: Show assigned instructor name on card header
- **Instructor assignment dropdown** per session card (updates `swim_sessions.instructor_id`)

### 5. Enrollment flow update

- `SessionPicker.tsx`: Also filter by `registration_status = 'open'` so closed sessions don't appear for booking

### 6. Route cleanup

- Remove unused `/admin/dive-bookings` and `/admin/trip-reservations` routes and imports from `App.tsx`

---

### What stays the same

- All existing `swim_sessions` rows and their data (times, levels, age groups, capacities, dates)
- Public `SwimLessons.tsx` schedule display (hardcoded slots match the DB)
- Enrollment flow logic and assessment
- Pricing ($30 group, $45 semi-private, $65 private, $45 registration fee)

### Files affected

| Action | File |
|--------|------|
| Create | `src/pages/admin/InstructorsAdmin.tsx` |
| Create | `src/pages/admin/SessionsAdmin.tsx` |
| Modify | `src/App.tsx` — add 2 routes, remove 2 unused routes |
| Modify | `src/components/admin/AdminSidebar.tsx` — add Instructors + Sessions links |
| Modify | `src/pages/admin/ClassRosterAdmin.tsx` — color-coding + instructor display/assignment |
| Modify | `src/components/swim-enrollment/SessionPicker.tsx` — filter by registration_status |
| Migration | Create instructors table, add instructor_id + registration_status to swim_sessions |

