## What's actually happening

Verified against the availability data: nothing is double-booked. The slot picker renders one card per instructor, and two coaches are scheduled on the same hours:

- Tuesdays 3:00 to 6:00 PM (Jul 14 to Aug 4): Faith Mailoux and Sophia Cheney
- Thursdays 3:00 to 6:00 PM (Jul 16 to Aug 6): Leona Cheney and Sophia Cheney

So each 30 minute time renders twice, once per coach, and the weekly options list shows the same day and time pattern twice. Since both coaches really do work those hours, the cards are correct. The problem is that they read as duplicates.

## Fix: keep per coach cards, make the coach the obvious difference

### 1. Public booking page, day grid
Group each day's slots by start time. Times with a single coach look exactly as they do today. Times with more than one coach render as one time heading with the coach buttons side by side underneath, for example:

```text
Tuesday, Jul 28
  3:00 PM   [ Faith Mailoux ]  [ Sophia Cheney ]
  3:30 PM   [ Faith Mailoux ]  [ Sophia Cheney ]
  4:00 PM   [ Sophia Cheney ]
```

The time is printed once, each coach stays individually selectable, and the existing one instructor per booking lock and promo pricing badge behavior is unchanged.

### 2. Public booking page, weekly options
Same treatment: group recurring patterns by day and time, and when two coaches offer it, show one row for "Tuesdays at 3:00 PM" with a coach choice on that row rather than two near identical rows.

### 3. Admin calendar, Private Lessons panel open slots
The open slot chips get the same grouping: one time label per row with a coach chip per available coach, so the front desk can see at a glance that 3:00 PM means two rooms open, not a duplicate entry.

### 4. Small data cleanup note (no writes without your say so)
Sophia Cheney has two Tuesday 3:00 to 6:00 PM blocks whose date ranges nearly repeat the same weeks (Jun 9 to Jun 30 and Jun 11 to Jul 2), plus the current Jul 14 to Aug 4 block. The picker already collapses these so they cause no visible duplicate, but the stale June rows are clutter. I will flag them for you rather than delete anything.

## Technical notes

- Files touched: `src/components/private-lessons/SlotPicker.tsx` (day grid and recurring pattern rendering) and `src/components/admin/calendar/PrivateLessonsPanel.tsx` (open slots section).
- Presentation only. No changes to `privateBooking-core.ts` slot composition, `useCalendarData.ts` slot math, availability blocks, holds, or booking writes.
- The existing dedupe key (instructor, date, start time) stays as is; it already prevents true duplicates from overlapping blocks belonging to the same coach.
