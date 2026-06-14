## Goal
Prevent abandoned-checkout bookings from ever being auto-charged by the hourly cron.

## Problem
The `charge-private-lesson-occurrence` edge function currently selects occurrences with:
- `auto_charge_status = 'pending'`
- `status <> 'cancelled'`
- `occurrence_date <= tomorrow`

It does NOT exclude rows where the parent abandoned Stripe checkout. Those rows live in the DB as:
- `lesson_bookings.status = 'pending_card'`
- `lesson_booking_occurrences.status = 'pending_card'`

There are currently 9 such occurrences sitting in the table. Today's cron run skipped them only by accident (no stored payment method) — but they still get considered every hour and recorded as "failed" attempts.

## Fix

### 1. Edge function: `supabase/functions/charge-private-lesson-occurrence/index.ts`
Tighten the SQL filter to only consider real, active bookings:
- Add `o.status = 'scheduled'` (replaces the loose `neq cancelled`)
- Add `b.status = 'active'` on the joined `lesson_bookings`

This guarantees `pending_card` (abandoned) rows are never even fetched, let alone charged.

### 2. One-time cleanup (data migration via insert tool)
The 9 abandoned `pending_card` occurrences (and their parent bookings) are stale clutter. Two options — I'll ask which you want:
- **A.** Leave them alone (just stop charging them — safest).
- **B.** Hard-delete the abandoned bookings + their occurrences so they disappear from admin views.

### 3. Verify
- Re-deploy the function.
- Re-run the cron call manually and confirm `processed: 0` (nothing left pending today) and that no `pending_card` rows are touched.

## Technical notes
- No schema change. No new columns. No migration needed for the fix itself.
- The hourly pg_cron schedule stays as-is.
- Admin-initiated `admin-charge-private-lesson-occurrence` is unaffected (admin explicitly picks a row).