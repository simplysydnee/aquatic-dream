## Problem

On `/admin/private-lessons/new`, the "Client" step searches only `lesson_bookings` + `swim_enrollments`. Lesson requests never become "clients" until they get booked or enrolled, so a family that filled out the request form is invisible here. The data is fine — `lesson_requests` has parent name/email/phone, child name, age, dob, notes — it just isn't queried.

## Fix

### 1. Add `lesson_requests` to the client search (BookingWizard ClientStep)

Extend the parallel query in `src/components/admin/booking/BookingWizard.tsx` (around line 319) to also hit `lesson_requests`:

- Select: `parent_name, parent_email, parent_phone, child_name, child_age, child_dob, lesson_type, preferred_times, notes, status, created_at`
- Same `.or(...ilike...)` across parent_name/email/phone and child_name
- Filter to open requests: `status in ('new','contacted','scheduled')` (skip `closed`)
- Order by `created_at desc`, limit 20

Merge into the existing dedup `map` with `source: "request"`. Because `lesson_requests` only has a combined `parent_name`/`child_name`, split on first space into first/last when populating `parent_first/parent_last` and `swimmer_first/swimmer_last` for the picker.

### 2. Surface requests visually in the result list

Add a `"request"` variant to `ClientSearchResult.source` and render a colored chip ("Lesson Request") next to "Booking" / "Enrollment" so admins immediately see this person came from the request form (not a past client).

Show the request's `preferred_times` and `notes` as a one-line muted subtitle when present — that context is the whole reason the admin is booking them.

### 3. Quick access to pending requests from the booking page

Right now there's no entry point from `/admin/private-lessons/new` to recent requests. Add a small panel above (or beside) the wizard on `src/pages/admin/BookingNew.tsx` titled "Pending lesson requests" that lists the latest ~10 open requests (`status != 'closed'/'scheduled'`). Clicking one prefills the wizard's client step with that request's parent/child info and jumps to the Type step.

Implementation:
- New small component `PendingRequestsSidebar` (or inline in `BookingNew.tsx`) that fetches `lesson_requests` once on mount.
- Lift `initialClient` into `BookingWizard` as a new optional prop (mirroring `initialSlot`/`initialType`) so the page can pass a prefilled client.
- Each row shows: child name, age, parent name, preferred times, "Book →" button.

### 4. Same boost in the quick-book dialog

`BookingQuickDialog` already renders `BookingWizard`. The search upgrade in step 1 is enough there — no extra UI needed inside the dialog itself, since the dialog is launched from contexts (calendar click) where the admin already knows the slot.

## Out of scope

- No DB migration. `lesson_requests` already has all needed fields and RLS already allows admin reads.
- We are **not** auto-promoting requests into a separate "clients" table — the app's notion of a client is computed (see `useSwimmers.ts`), and requests are already included there. The only gap is the booking-wizard search, which this plan closes.
- No change to the underlying lesson-request status flow; booking from a request doesn't auto-mark it `scheduled` (existing "Book from request" flow handles that separately).

## Files

- `src/components/admin/booking/BookingWizard.tsx` — extend search, render request source chip, accept new `initialClient` prop.
- `src/pages/admin/BookingNew.tsx` — add pending requests panel, pass `initialClient` to wizard.
