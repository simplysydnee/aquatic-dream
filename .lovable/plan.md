# Two small fixes

## 1. Close the Jun 13, 12:00–12:30 PM slot for Jaclyn Vaughan
That slot is currently open (no booking exists for it). I'll insert a one-date blackout in `instructor_booking_blocks` so it no longer appears as bookable:
- instructor_id: Jaclyn (`31408e2f-…aa42e7aac458`)
- kind: `date_range`, start_date = end_date = `2026-06-13`
- start_time `12:00`, end_time `12:30`
- is_blackout: true
- notes: "Closed by admin"

This is identical to what the "Close this slot" button does, just executed directly so it's done.

## 2. Show 12-hour times in availability block headers
In `src/pages/admin/PrivateLessonsAdmin.tsx`, the block summary row currently renders raw 24-hour strings:
- Line 666: `{b.start_time.slice(0,5)}–{b.end_time.slice(0,5)}` → use `fmtTime(...)`
- Line 668: same for the optional break range

Result: "10:00–13:00" becomes "10:00 AM – 1:00 PM", matching the rest of the page.

No other files or behavior change.
