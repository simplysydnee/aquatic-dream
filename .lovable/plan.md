## What I found

The admin **Complete New Waiver** flow writes to `visitor_waivers`, so the Waivers page labels those as **visitor** even when the swimmer is already enrolled. Right now, there are **42 active enrolled swimmers** whose names match a recent visitor/kiosk waiver, and all 42 are still showing incomplete because their enrollment record was never linked/stamped.

## Plan

### 1. Preserve legal waiver records, don’t delete duplicates
- Keep every submitted waiver as its own legal record.
- Treat multiple waivers for the same swimmer as history, not data to delete.
- Use the most recent active waiver for the swimmer’s current “waiver complete” status.

### 2. Add a real link between visitor waivers and enrolled swimmers
Create a backend link table that connects:
- `visitor_waivers` → `swim_enrollments`
- `visitor_waivers` → `lesson_bookings`

This lets the app know a “visitor” waiver actually covers an enrolled swimmer or private lesson booking.

### 3. Backfill existing completed admin waivers
For all existing visitor/kiosk waivers:
- Match swimmer first + last name to active enrolled swimmer / lesson booking child name.
- Link the waiver to the matching enrollment or booking.
- Stamp `waiver_signed_at` on the swimmer/booking when it is currently blank.
- If a swimmer has 2–3 waivers, link them all but use the newest valid waiver as the current completion source.

### 4. Auto-link future “Complete New Waiver” submissions
Update the `submit-visitor-waiver` backend function so when staff completes a new waiver from `/admin/waivers`, it immediately:
- Saves the visitor waiver.
- Searches for matching enrolled swimmers / bookings.
- Creates the link records.
- Updates `waiver_signed_at` so roster/calendar/client pages show waiver complete right away.

### 5. Fix how the Waivers admin page labels them
Update `/admin/waivers` so linked visitor waivers no longer look like unrelated visitors:
- Show linked enrolled swimmer names.
- Label linked records as **Enrollment** or **Lesson** when applicable.
- Keep truly unmatched waivers as **Visitor**.
- Optionally show a small indicator when a row was originally submitted from the admin visitor-waiver flow.

### 6. Audit view for unmatched or duplicate cases
Add a small admin-only audit section/filter on the Waivers page:
- **Linked to swimmer**
- **Unmatched visitor waiver**
- **Multiple waivers for same swimmer**

This makes it easy to clean up cases where names are misspelled or a parent entered a nickname.

## Verification

After implementation:
- The 42 currently matched active enrollments should show waiver complete.
- Existing admin/kiosk waivers for enrolled swimmers should display as linked to their swimmer instead of only “visitor.”
- New waivers completed from the admin waiver page should immediately update the swimmer’s waiver status.
- Duplicate waiver submissions remain available as history but do not cause duplicate “incomplete” statuses.