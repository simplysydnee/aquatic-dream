
## Order of operations

1. **Charge today first** (manual one-shot)
2. **Then schedule the cron** so this never happens again
3. **Add verification** so we can always tell what Stripe did

---

## Step 1 — Charge today's lessons NOW

Real lessons today (self-serve abandoned rows ignored — those slots are vacant):

| Time | Child | Card on file? | Action |
|------|-------|---------------|--------|
| 10:00 | Reet Pattar | ✅ | Charge $50 |
| 10:00 | Zoey Silva | ✅ | Charge $50 |
| 10:00 | Adrian Chacon | ✅ | Charge $50 |
| 11:00 | Kiaan Bansal | ❌ | Skip — capture card via admin dialog |
| 11:30 | Leonardo Mendoza | ✅ | Charge $50 |
| 12:00 | Angelo Mendoza | ✅ | Charge $50 |
| 12:30 | Karanveer Singh | ✅ | Charge $50 |
| 15:30 | Carson Maldonado | ✅ | Charge $50 |

**7 charges × $50 = $350 today.** Only Kiaan needs a card captured.

How: invoke the existing `charge-private-lesson-occurrence` edge function once via `curl_edge_functions` with `x-cron-secret`. It already enforces "≥1h before start" and idempotency (only touches `pending` rows), so re-running is safe. Each succeeded charge writes `payment_status='paid'`, `stripe_payment_intent_id`, `paid_at`.

I'll report the per-row result so you can confirm.

---

## Step 2 — Schedule the cron (forward fix)

Add a `CRON_SECRET` runtime secret, then insert a pg_cron job that runs every 15 min and POSTs to `charge-private-lesson-occurrence?env=live` with `x-cron-secret`. The function's "≥1h before lesson start" guard means each lesson is charged once, at the right moment.

```sql
select cron.schedule(
  'charge-private-lessons-every-15-min',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://<project>.supabase.co/functions/v1/charge-private-lesson-occurrence?env=live',
       headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>')
     ); $$
);
```

(Inserted via Supabase insert tool, not migration — embeds project-specific values per the schedule-jobs guide.)

---

## Step 3 — In-app verification

In `PrivateLessonDetailDialog.tsx`, add a **Payment** section showing:

- Status badge (paid / card_on_file / unpaid / failed)
- Amount charged + `paid_at` timestamp
- Last auto-charge attempt time + error message (if failed)
- PaymentIntent ID with copy button and **"View in Stripe →"** link to `https://dashboard.stripe.com/{test/}payments/{pi_id}`
- **"Retry charge"** button when `auto_charge_status='failed'` (reuses `admin-charge-private-lesson-occurrence`)

In `PrivateLessonsPanel.tsx`, the existing payment badge becomes a Stripe link when a PI exists.

Tiny helper added to `src/lib/stripe.ts`: `stripeDashboardUrl(pi_id, env)`.

No schema changes — all fields already exist on `lesson_booking_occurrences`.

---

## Step 4 — Daily admin recap email

New edge function `private-lesson-daily-recap`, scheduled nightly at 9pm PT via pg_cron. Queries today's occurrences and emails admin (via Resend) a summary:

- ✅ Charged: count, total $, list with PI links
- ❌ Failed: list with error reason
- ⚠️ No card on file: action items for tomorrow
- ⏭️ Skipped (cancelled / manual)

I'll ask which admin email to send to during build (or reuse one already wired).

---

## Files

- `supabase/functions/private-lesson-daily-recap/index.ts` (new)
- `src/components/admin/calendar/PrivateLessonDetailDialog.tsx` (Payment section + Retry)
- `src/components/admin/calendar/PrivateLessonsPanel.tsx` (badge → Stripe link)
- `src/lib/stripe.ts` (`stripeDashboardUrl` helper)
- New runtime secret: `CRON_SECRET`
- Two pg_cron schedules (charge every 15 min, recap nightly)

No schema migration needed.
