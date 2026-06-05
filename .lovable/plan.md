## Goal
Expand `/admin/private-lessons` so it covers both private and semi-private lessons, separates past from upcoming bookings, lets an admin re-categorize a recurring block's lesson type, and lets an admin manually book a lesson into any open slot.

## Changes

### 1. Include semi-private lessons everywhere
- Update the two booking queries in `PrivateLessonsAdmin.tsx` (`load()`) to fetch `lesson_type IN ('private','semi_private')` instead of just `private`.
- Add a "Type" column / badge (Private vs Semi-Private) in the booking list and in the slot popovers.
- Rename the page header/tab labels from "Private Lessons" to "Private & Semi-Private Lessons" (route stays the same).

### 2. Split upcoming vs past bookings
- In the Bookings tab, derive two arrays from `bookings`:
  - **Upcoming** — bookings with at least one non-cancelled occurrence dated `>= today`.
  - **Past** — bookings whose occurrences are all in the past or cancelled.
- Render them in two separate cards: "Upcoming Bookings" (default expanded) and "Past Bookings" (collapsed by default, expandable).
- Past block is read-only style (no Charge/Cancel buttons, only View Details + Delete).

### 3. Convert a recurring block's lesson type
- Add a `default_lesson_type` column to `instructor_booking_blocks` (`text`, default `'private'`, check in `('private','semi_private')`) via migration.
- In the block list row and edit dialog, add a "Lesson type" selector (Private / Semi-Private). Saving updates the block.
- The public booking flow keeps showing all open slots, but this value is what an admin's manual booking and the slot's badge default to.

### 4. Manually book a lesson from any open slot
- Each open slot (no booking, not blacked out) gets a "Book lesson" action in its popover (next to existing Block Slot).
- Opens a dialog with: Lesson type (private/semi, prefilled from block), Parent name/email/phone, Child name/age, Notes, optional "Recurring weekly until …" date.
- Submits via a new edge function `admin-create-private-booking` that:
  - Inserts a `lesson_bookings` row (`booking_source = 'admin'`, no Stripe customer required, `price_per_session` defaults: 65 private / 45 semi).
  - Inserts `lesson_booking_occurrences` for the chosen date (or weekly series if recurring chosen).
  - Marks `payment_status = 'unpaid'`, `auto_charge_status = 'skipped'` (admin can charge later if a card is added).
- After success, reload and the slot appears as booked.

## Technical notes
- Files touched:
  - `src/pages/admin/PrivateLessonsAdmin.tsx` — queries, type column, past/upcoming split, type selector, manual-book dialog, "Book lesson" action.
  - `src/components/private-lessons/PrivateBookingFlow.tsx` (optional) — show the block's lesson type label, no business change.
  - New: `supabase/functions/admin-create-private-booking/index.ts` (admin-only, JWT-verified, Zod-validated).
  - New migration: add `default_lesson_type` to `instructor_booking_blocks`.
- "Past" cutoff uses the occurrence_date, not booking creation date.
- No change to the public self-serve booking flow's pricing or Stripe-card-required rule.

```text
Bookings tab
├── Filter: All | Private | Semi-Private
├── Upcoming Bookings (N)
│   └── rows with Type badge + Charge/Cancel
└── ▸ Past Bookings (M)   ← collapsible
    └── rows with Type badge + View/Delete only

Blocks tab
└── block row
    ├── Lesson type: [Private ▾]   ← new
    ├── Edit / Delete
    └── ▾ open slots
        └── slot popover: View booking | Book lesson | Block slot
```
