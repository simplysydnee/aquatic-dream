

## Combined Plan: Fix Missing Levels + Class Dates System

Two things to execute: (A) insert missing swim_session rows so every school-age time slot has yellow/blue/green, and (B) build the class dates system with manage-dates modal, parent-facing dates, and confirmation dates.

---

### Part A: Insert Missing Session Rows

From the database audit, school-age time slots currently have:
- **3:00–5:30 PM slots**: yellow + blue, but **no green**
- **6:15+ PM slots**: yellow + green, but **no blue**

**Action**: Insert ~16 missing `swim_sessions` rows (green for early slots, blue for late slots) across both Session 1 (Jun 6–29) and Session 2 (Jul 13–Aug) so every school-age slot has all three levels under Deep Sea Divers (yellow) + Ocean Masters (blue, green). No code changes needed for this part.

---

### Part B: Class Dates System

**Step 1 — Database migration**: Create `session_lesson_dates` table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| session_id | uuid | FK to swim_sessions ON DELETE CASCADE |
| lesson_date | date | NOT NULL |
| is_cancelled | boolean | DEFAULT false |
| cancel_reason | text | nullable |
| created_at | timestamptz | DEFAULT now() |

RLS: public SELECT, authenticated ALL.

**Step 2 — SessionsAdmin.tsx changes**:
- Rename `getLessonCount` to `getClassCount`, change label from "lessons" to "classes"
- Add a "Manage Dates" button (calendar icon) on each session period header
- New `ManageDatesModal` component:
  - "Generate Dates" button auto-computes all Mon/Wed dates within the session date range and inserts them
  - Shows a checklist of dates; each row has a cancel toggle + optional reason (e.g. "4th of July")
  - Active date count displayed in the period header

**Step 3 — SessionPicker.tsx**: After selecting a time slot, show the list of active (non-cancelled) class dates below the card (e.g. "Mon Jun 9, Wed Jun 11, ..."). Fetch from `session_lesson_dates` using the slot's session period dates.

**Step 4 — EnrollmentConfirmation.tsx**: Fetch and display the active class dates for the enrolled session. Pass `sessionId` from `SwimEnrollment.tsx` to the confirmation component.

**Step 5 — SwimEnrollment.tsx**: Pass `sessionId` state to `EnrollmentConfirmation`.

---

### Files affected

| Action | Target |
|--------|--------|
| DB insert | ~16 new `swim_sessions` rows (missing green/blue levels) |
| DB migration | Create `session_lesson_dates` table with RLS |
| Modify | `src/pages/admin/SessionsAdmin.tsx` — rename to "classes", add Manage Dates modal |
| Modify | `src/components/swim-enrollment/SessionPicker.tsx` — show class dates |
| Modify | `src/components/swim-enrollment/EnrollmentConfirmation.tsx` — list class dates |
| Modify | `src/pages/SwimEnrollment.tsx` — pass sessionId to confirmation |

