# Adult tag on lessons

Now that adults can book Private, staff and instructors need to see at a glance that a lesson is an adult lesson. Any swimmer whose date of birth makes them 18 or over gets a small "Adult" tag next to their name, everywhere their name appears for staff.

## Rule

- Adult = date of birth on file, 18 or over as of today.
- Adult Swim memberships are always tagged adult, even if no date of birth is on file.
- No date of birth on file and not Adult Swim: no tag. Nothing is guessed from the name.
- Tag only. No change to pricing, scheduling, capacity, or booking rules.

## Where the tag appears

- Admin calendar: day view and week view lesson blocks, and the block detail panel.
- Instructor day modal and the private lessons panel.
- Private lesson detail dialog.
- Printed day schedule, so the tag is on the paper the instructor carries.
- Instructor "My roster".
- Class times roster rows on /admin/class-times.
- Memberships list on /admin/memberships.

Wording: a small "Adult" chip in the neutral/navy style already used for the "(semi)" marker, placed right after the swimmer name.

## Technical notes

`memberships.child_dob`, `lesson_bookings.child_dob`, and `swim_enrollments.child_dob` all exist. No migration is needed. The gap is that most queries do not select the column.

- New helper in `src/lib/programEligibility.ts` (reusing `ageFromDob`): `isAdultSwimmer({ dob, planKey })` returning true for 18+ or `adult_group`.
- New shared chip `src/components/admin/AdultTag.tsx`, rendered conditionally.
- Add `child_dob` to the selects in:
  - `src/hooks/useCalendarData.ts:222` (`lesson_bookings` join) and the `membership_occurrences` join (`memberships.child_dob`), plus the `PrivateLessonBooking` and `MembershipLesson` interfaces.
  - `src/pages/admin/PrintDaySchedule.tsx:145,157`
  - `src/pages/instructor/InstructorMyRoster.tsx:59`
  - `src/pages/admin/StandingSlotsAdmin.tsx:170`
- Render the tag at the existing name elements: `CalendarDayView.tsx:1203,1236,1299`, `InstructorDayModal.tsx:301`, `PrivateLessonsPanel.tsx:167`, `PrivateLessonDetailDialog.tsx:314`, `PrintDaySchedule.tsx:523,637`, `InstructorMyRoster.tsx:116`, `StandingSlotsAdmin.tsx:864`, and the swimmer cell in `MembershipsAdmin.tsx`.
- `CalendarWeekView.tsx` renders blocks through the shared helper; confirm during the build whether it needs its own insertion point.
- `KioskCheckIn.tsx` already has `memberships.child_dob`; add the tag there only if the same name row is shown to staff.

No database, Stripe, or edge function changes.
