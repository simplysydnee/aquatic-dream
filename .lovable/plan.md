## SMS Reminder System

### 1. Migration (already applied)

`public.reminder_logs` table with `id, swimmer_name, lesson_occurrence_id (fk), session_lesson_date_id (fk), enrollment_id (fk), booking_id (fk), channel, reminder_kind, phone, message, scheduled_at, sent_at, status, error, created_at`. RLS on, admin SELECT via `has_role`, service_role full. Indexes on occurrence lookup, group lookup, created_at.

### 2. Shared helpers (inlined per function)

- `normalizePhone` → US `+1XXXXXXXXXX`.
- `formatPTTime(timeStr)` → treats `time without time zone` columns as PT wall-clock; renders `h:mm AM/PM`.
- `ptWeekday(dateStr)` / `ptToday()` via `Intl.DateTimeFormat({ timeZone: "America/Los_Angeles" })`.
- `sendSms(phone, text)` → POST TextMagic v2 `/messages` with `X-TM-Username` / `X-TM-Key`.

Template: `${first_name} has a swim lesson ${when} at ${time} at Aquatic Dreams. See you there!`
- `manual_today` → `when="today"`
- `private_24h` / `group_24h` → `when="tomorrow"`
- `group_48h` → `when=<weekday name>`

No consent filter on any path. Missing phone → log `failed` with `error="no_phone"`.

### 3. PART 1 — `supabase/functions/admin-send-todays-reminders/index.ts`

JWT → `getClaims` → `has_role(uid,'admin')`. Loads today's already-sent occurrence_ids from `reminder_logs`. Selects `lesson_booking_occurrences` for today (PT) with `status='scheduled'`, joined `lesson_bookings` (skip if `b.status='cancelled'`). Sends SMS, logs each attempt with `reminder_kind='manual_today'`. Returns `{ ok, sent, failed, errors[], date }`.

### 4. PART 1 UI — `src/pages/admin/CalendarAdmin.tsx`

"Send today's reminders" button in header row next to Print Schedule. `supabase.functions.invoke('admin-send-todays-reminders')`, toast with summary, loading state. Disable after success via local state + `localStorage["reminders-sent-${today}"]`.

### 5. PART 2 — `supabase/functions/send-private-lesson-sms-reminders/index.ts` (cron)

Auth: bearer `SUPABASE_SERVICE_ROLE_KEY` OR `x-cron-secret` matching `CRON_SECRET`. `tomorrow_pt = today + 1`. Selects occurrences for tomorrow, `status='scheduled'`, joined booking `lesson_type IN ('private','semi-private')`, `b.status != 'cancelled'`, not already in `reminder_logs` for that occurrence with `channel='sms', status='sent'`. Sends SMS, logs with `reminder_kind='private_24h'`. Semi-private also messages `partner_parent_phone` when present (logged separately by phone, same occurrence_id). Returns `{ ok, sent, failed }`.

### 6. PART 3 — `supabase/functions/send-group-lesson-sms-reminders/index.ts` (cron)

Same auth. For each (`group_48h`, today+2) and (`group_24h`, today+1):
- `session_lesson_dates` where `lesson_date=target`, `is_cancelled=false`, AND `lesson_date = MIN(lesson_date) for that session WHERE is_cancelled=false`.
- Join `swim_sessions` for `start_time`.
- `swim_enrollments` where `session_id` matches and `status NOT IN ('cancelled','suspended')`.
- Skip when `reminder_logs` already has `(session_lesson_date_id, enrollment_id, channel='sms', reminder_kind=<kind>, status='sent')`.
- Send + log; `no_phone` if missing.
Returns `{ ok, sent_48h, sent_24h, failed }`.

### 7. Cron schedule

`supabase--insert` two `cron.schedule` jobs at `0 17 * * *` UTC posting to the two cron functions with `x-cron-secret: <CRON_SECRET>` header (fires 10 AM PDT / 9 AM PST; DST-naive, accepted).

### 8. Files

- New: `supabase/functions/admin-send-todays-reminders/index.ts`
- New: `supabase/functions/send-private-lesson-sms-reminders/index.ts`
- New: `supabase/functions/send-group-lesson-sms-reminders/index.ts`
- Edit: `src/pages/admin/CalendarAdmin.tsx`
- Cron inserts via `supabase--insert`.
- Deploy the three new functions.
- No edits to existing `send-lesson-occurrence-reminders`.
