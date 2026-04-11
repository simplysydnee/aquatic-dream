

## Fix Calendar + Add Roster Detail with Contact Info & Check-In

### What This Solves
1. **Swim classes don't appear on calendar** — all classes use `day_of_week = "monday_wednesday"` but the calendar filters for exact matches like `"Monday"`
2. **No parent/emergency contact info visible** when clicking a class on the calendar
3. **Check-in works** but the roster detail panel doesn't show contact details for front desk use

### Changes

**File 1: `src/hooks/useCalendarData.ts`**
- Remove `.in("day_of_week", daysNeeded)` filter from the Supabase query — fetch all active swim sessions
- This lets client-side filtering handle multi-day values like `"monday_wednesday"`
- Also fetch `enrollment_agreements` (emergency contact data) joined by enrollment_id, and expose it

**File 2: `src/components/admin/calendar/CalendarDayView.tsx`**
- Change `todaySessions` filter from `s.day_of_week === dayName` to `s.day_of_week.toLowerCase().includes(dayName.toLowerCase())`
- Pass emergency contact data through to the detail panel

**File 3: `src/components/admin/calendar/CalendarWeekView.tsx`**
- Apply same `includes`-based day matching for week view

**File 4: `src/components/admin/calendar/CalendarBlockDetail.tsx`**
- Expand the swim roster section: under each student, show:
  - **Parent name** and **phone number** (from `swim_enrollments`)
  - **Emergency contact** name, phone, and relationship (from `enrollment_agreements`)
- Keep the existing check-in checkbox functionality
- Add visual grouping: student info → parent contact → emergency contact
- Make phone numbers tappable (`tel:` links) for quick calling

### Data Flow
- `useCalendarData` fetches `enrollment_agreements` alongside enrollments
- The agreements are passed to `CalendarDayView` → `CalendarBlockDetail`
- In the detail panel, each enrollment is matched to its agreement by `enrollment_id`

### Result
- Classes appear on the calendar on correct days (Monday and Wednesday both show the classes)
- Clicking a class block shows the full roster with parent name, phone, and emergency contact
- Front desk can check in swimmers and immediately see who to call in an emergency

