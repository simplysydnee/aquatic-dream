## Goal
Two new admin calendar workflows for handling cancellations (instructor sick, pool closure, etc.).

**No refunds.** Per owner direction, cancelled lessons are **never refunded** — the value is preserved as **account credit** the family applies to a future class. Stripe is not touched.

1. **Per-block cancel** — cancel a single class/lesson directly from the existing block-detail panel.
2. **Instructor day modal** — click an instructor's name/initials on the calendar, see everything they have that day, multi-select, bulk-cancel and/or reassign.

---

## 1. Per-block cancel (lives on the block detail you already open)

Add a **Cancel this lesson** button to `CalendarBlockDetail.tsx` for all three block types. Opens a `CancelLessonDialog` with:

- **Reason** dropdown: Instructor out, Pool closure, Weather, Low enrollment, Other (+ free-text note).
- **Affected payments preview** — read-only list per swimmer showing paid amount and a fixed badge: **"Account credit — $X"** (or "No payment on file" if unpaid). No refund options, no Stripe action.
- **Notify customers** checkbox (default on) → app email to each affected parent explaining the cancellation and the credit on their account.
- Confirm button.

### What happens on confirm
- Group session date: `session_lesson_dates.is_cancelled = true` + `cancel_reason` + `cancelled_at` + `cancelled_by` (existing column + new metadata).
- Lesson occurrence: new `lesson_booking_occurrences.status = 'cancelled'` + `cancel_reason` + `cancelled_at` + `cancelled_by`.
- Pool event: delete row (matches today's behavior).
- For each paid swimmer: insert a row in new `client_credits` table for the amount paid (source = `lesson_cancel` or `session_cancel`, `source_ref` = occurrence/enrollment id).
- Stripe is **not** called. Existing payment rows stay marked paid (the money stays with us, now reflected as credit).
- Trigger `send-transactional-email` with new `lesson-cancellation` template per recipient.

---

## 2. Instructor day modal (new)

Make instructor names/initials in `CalendarDayView.tsx` and `CalendarWeekView.tsx` clickable. Opens `InstructorDayModal`:

- Header: instructor name + a shadcn date-picker (defaults to the day clicked from). Switch dates without closing.
- Unified list of everything assigned to that instructor on the selected date: group sessions, private and semi-private lessons (one row each, showing time, type, swimmer, payment status). Already-cancelled rows are dimmed and locked.
- Top toolbar: **Select all** / **Clear**, then **Cancel selected** and **Reassign selected**.
- **Cancel selected** opens the same `CancelLessonDialog` from #1, pre-loaded with all selected blocks (one combined credit/notify summary per affected swimmer).
- **Reassign selected** opens a small dialog: pick a new instructor (existing `InstructorPicker`); applies to **just this occurrence** (group: writes a per-date instructor override; private: updates `lesson_booking_occurrences.instructor_id`). Original instructor keeps the rest of the series.
- Optional notify-the-parent checkbox on reassign.

---

## 3. Email template

New transactional template `lesson-cancellation` (React Email, brand maritime palette). Two variants by `templateData.action`:
- **cancelled** — date/time, reason, "$X added to your account credit — automatically applied to your next class," contact info to rebook.
- **reassigned** — new instructor name, same time, short note.

Sent one-per-recipient via existing `send-transactional-email` queue (idempotency key = `cancel-${occurrenceId}` or `reassign-${occurrenceId}`).

---

## 4. Schema changes (one migration)

```text
lesson_booking_occurrences
  + status text not null default 'scheduled'   -- 'scheduled' | 'cancelled'
  + cancel_reason text
  + cancelled_at timestamptz
  + cancelled_by uuid
  + instructor_id uuid              -- per-occurrence override (NULL = inherit booking)

session_lesson_dates
  + cancelled_at timestamptz
  + cancelled_by uuid
  + instructor_override_id uuid     -- per-date reassignment for group classes

client_credits (NEW)
  id, parent_email, amount_cents, source ('lesson_cancel' | 'session_cancel'),
  source_ref uuid, note, used_at, used_against, created_at, created_by
  RLS: admins manage all; service-role manage all.
```

No refund columns, no Stripe writes.

Public `SessionPicker`, calendar reads, and roster views already filter on `is_cancelled`; the new occurrence `status = 'scheduled'` filter is added in the same pass.

---

## 5. Credit redemption (admin-side, this pass)

- Account credits show on the swimmer drawer's payments tab and on the parent profile (badge + history).
- During admin-side checkout / manual enrollment, if the parent email has unused credit, an "Apply $X credit" toggle appears and reduces the amount due. Self-serve (parent-facing) credit redemption is **out of scope** for this pass — owner can apply it at the desk.

---

## Technical notes
- Files touched: `CalendarBlockDetail.tsx`, `CalendarDayView.tsx`, `CalendarWeekView.tsx`, new `InstructorDayModal.tsx`, new `CancelLessonDialog.tsx`, new `ReassignDialog.tsx`, `useCalendarData.ts` (add status/credit fields), swimmer drawer payments tab (show credits), one Supabase migration, one new email template + registry entry, redeploy of `send-transactional-email`.
- No Stripe edge function calls. `admin-issue-refund` and `cancel-enrollment-refund` are **not** invoked from this flow.
- No price/curriculum changes; no public-facing changes other than already-cancelled lessons being hidden (already the case).

## Out of scope
- Any refund path (explicitly removed per owner).
- Self-serve credit redemption on the parent enrollment flow.
- Bulk cancel across multiple **days** (the day modal handles a single day at a time).
- SMS notifications (email only).