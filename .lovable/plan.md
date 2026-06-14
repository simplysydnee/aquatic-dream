## Goal
Switch private-lesson charging to **manual only**. No card is auto-charged by cron — admins click "Charge" and confirm the amount before it runs.

## Changes

### 1. Disable the hourly auto-charge cron
Use `supabase--insert` to run:
```sql
select cron.unschedule(jobid) from cron.job
 where command ilike '%charge-private-lesson-occurrence%';
```
Also short-circuit the `charge-private-lesson-occurrence` edge function so even a manual cron POST returns `{ disabled: true, processed: 0 }` without touching any bookings — belt + suspenders in case the schedule comes back.

### 2. New confirm dialog component
`src/components/admin/calendar/ChargeConfirmDialog.tsx` — shadcn `AlertDialog`:
- Title: "Charge card on file?"
- Body shows: **Amount $X**, **Parent name**, **Lesson date** (formatted)
- Buttons: Cancel / Charge $X (destructive variant, with spinner while running)
- Props: `open`, `onOpenChange`, `amount`, `parentName`, `lessonDate`, `onConfirm`

### 3. Wire the dialog into the two existing Charge buttons
Both already call `admin-charge-private-lesson-occurrence` — we just gate them behind the new dialog instead of `window.confirm`.

- **`src/components/admin/calendar/PrivateLessonDetailDialog.tsx`** (per-occurrence button on calendar detail, line ~300)
  - Replace the `confirm()` call in `chargeCardOnFile` with dialog state
  - Render `<ChargeConfirmDialog />` with the occurrence date and parent name

- **`src/pages/admin/PrivateLessonsAdmin.tsx`** (per-occurrence row, line ~999, and booking summary)
  - Same swap inside `chargeNow`
  - Add a booking-level "Charge next due lesson" button on the booking summary card (top of detail view) — finds the first occurrence where `auto_charge_status !== "succeeded"` and `status !== "cancelled"`, opens the dialog for it

### 4. UI copy cleanup
Remove "auto-charge" wording from the admin views (Pricing tab, occurrence list header "Charged" stays, but tooltips/help text say "Manual charge only"). No behavior change beyond labels.

## Out of scope
- No DB schema changes (we keep the `auto_charge_status` column as the source of truth for whether a lesson was paid).
- Cancellation refund flow untouched.
- Customer-facing checkout (first lesson) untouched.

## Technical notes
- The cron unschedule SQL must be run via `supabase--insert` (not migration) since `cron.job` is project-specific.
- `admin-charge-private-lesson-occurrence` already exists and works — no edge-function changes needed for the button itself.
- The `charge-private-lesson-occurrence` edge function gets a 4-line guard at the top of the handler returning early.
