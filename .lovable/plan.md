## Part 1 — "Session starts next week" SMS

New edge function `send-session-welcome-sms` mirroring `send-session-welcome-email`:

- Input: `sessionPeriodId` (admin-triggered).
- Recipients: all `swim_enrollments` in that period with status `confirmed`/`enrolled`/`pending_payment` and a valid `parent_phone`.
- **Dedupe by normalized parent phone**: parents with multiple swimmers get ONE combined SMS.
- Idempotency: log to `reminder_logs` with `reminder_kind = 'session_welcome_sms'`; skip any phone already logged as `sent` for this period.
- Uses shared `sendSms` + `logSms` from `supabase/functions/_shared/textmagic.ts`.
- Auth: admin JWT check.

**Message templates (warmer tone):**

Single swimmer:
> Hi! {ChildFirst}'s next swim session starts {Mon, Jul 13} at Aquatic Dreams. First lesson {Monday} at {3:30 PM}. We emailed full details — check spam if you don't see it! Reply STOP to opt out.

Multiple swimmers (same parent):
> Hi! Your swimmers ({FirstNames}) start their next session {Mon, Jul 13} at Aquatic Dreams. First lessons this week — check your email (and spam) for the full schedule. Reply STOP to opt out.

**Trigger:** admin clicks a new "Send 'starts next week' SMS" button on the Session 2 row in `SessionsAdmin`, matching placement of the current welcome-email button. Fires immediately after confirm.

No cron for now.

## Part 2 — Reports: Session gap outreach

New "Session gap outreach" section inside `src/pages/admin/ReportsAdmin.tsx`.

**Data:**

1. **Session 2 capacity** — per `swim_level`, `spots_left = SUM(max_students) - COUNT(enrollments)` across active sessions in that period. Show start/end dates and per-level spots remaining.
2. **Gap list** — parents/swimmers who EITHER:
   - Enrolled in Session 1 (`confirmed`/`enrolled`) but NOT in Session 2, OR
   - Have a `lesson_requests` row in the last 90 days with no matching Session 2 enrollment.

   **Name matching (corrected):** use the same COALESCE fallback pattern established today in `enrollments_waiver_status` — derive first/last from `child_name` when `child_first_name`/`child_last_name` are NULL:
   ```sql
   derived_first = COALESCE(
     NULLIF(trim(child_first_name), ''),
     NULLIF(split_part(coalesce(child_name,''), ' ', 1), '')
   )
   derived_last = COALESCE(
     NULLIF(trim(child_last_name), ''),
     CASE WHEN position(' ' in coalesce(child_name,'')) > 0
          THEN NULLIF(trim(regexp_replace(child_name, '^.* ', '')), '') END,
     CASE WHEN position(' ' in coalesce(child_first_name,'')) > 0
          THEN NULLIF(trim(regexp_replace(child_first_name, ' [^ ]+$', '')), '') END
   )
   ```
   Match key: `lower(derived_first) + lower(derived_last) + child_dob`. Fallback: `lower(parent_email) + lower(derived_first)` when dob missing. Applied to BOTH sides of the Session 1 → Session 2 comparison so the ~47% legacy `child_name`-only rows are not silently dropped. Implemented as a new SECURITY DEFINER RPC `get_session_gap_outreach(_from_period uuid, _to_period uuid)` returning both the gap list and per-level capacity — keeps the fallback logic server-side and mirrors the pattern in `enrollments_waiver_status`.

   Columns: Child name • Last level • Parent name • Email • Phone • Source (Session 1 / Lesson request) • Level-match indicator (green ✓ exact / yellow nearest).

**Actions on the list:**
- Multi-select rows.
- **Dedupe by parent** for both actions: parents with multiple swimmers get one email/SMS.
- **Send bulk marketing email** — opens existing marketing composer prefilled with Session 2 dates + enrollment link, targeted at selected parent emails via the existing marketing pipeline.
- **Send bulk SMS** — new edge function `send-bulk-outreach-sms` accepts `{ phone, childNames[], startDate }[]`, logs each to `reminder_logs` with `reminder_kind = 'session_outreach_sms'`.

**Default templates (editable in composer):**

- Email subject: "Open spots for Session 2 — starts Jul 13"
- SMS (single swimmer):
  > Hi! Session 2 at Aquatic Dreams starts Jul 13. We still have open spots for {ChildFirst} — enroll here: https://aquaticdreamsswim.com/swim-lessons Reply STOP to opt out.
- SMS (multiple swimmers, same parent):
  > Hi! Session 2 at Aquatic Dreams starts Jul 13. We still have open spots for {FirstNames} — enroll here: https://aquaticdreamsswim.com/swim-lessons Reply STOP to opt out.

## Technical notes

- New DB object: RPC `public.get_session_gap_outreach(_from_period uuid, _to_period uuid)` (SECURITY DEFINER, admin-only via `has_role`), using COALESCE fallback on legacy `child_name`.
- New edge functions:
  - `supabase/functions/send-session-welcome-sms/index.ts`
  - `supabase/functions/send-bulk-outreach-sms/index.ts`
- Modified files:
  - `src/pages/admin/ReportsAdmin.tsx` — new "Session gap outreach" section
  - `src/pages/admin/SessionsAdmin.tsx` — new "Send 'starts next week' SMS" button
- No table schema changes. All SMS logged via existing `reminder_logs` + `logSms()`.
- Admin-gated via `has_role(_user_id, 'admin')`.
- Both SMS paths dedupe by normalized `parent_phone` so multi-swimmer families receive exactly one message.
