ALTER TABLE public.lesson_bookings
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_consent_ip text,
  ADD COLUMN IF NOT EXISTS sms_consent_version text,
  ADD COLUMN IF NOT EXISTS sms_consent_text text;

CREATE INDEX IF NOT EXISTS idx_lesson_bookings_sms_consent
  ON public.lesson_bookings (sms_consent)
  WHERE sms_consent = true;

-- Backfill existing parents with phone numbers as opted-in.
UPDATE public.swim_enrollments
   SET sms_consent = true,
       sms_consent_at = COALESCE(sms_consent_at, now()),
       sms_consent_version = COALESCE(sms_consent_version, 'backfill-2026-06-08'),
       sms_consent_text = COALESCE(sms_consent_text,
         'Backfilled at SMS program launch — parent already enrolled before the opt-in checkbox existed. Parents may reply STOP to any text to revoke consent.')
 WHERE sms_consent = false
   AND parent_phone IS NOT NULL
   AND length(btrim(parent_phone)) >= 7;

UPDATE public.lesson_bookings
   SET sms_consent = true,
       sms_consent_at = COALESCE(sms_consent_at, now()),
       sms_consent_version = COALESCE(sms_consent_version, 'backfill-2026-06-08'),
       sms_consent_text = COALESCE(sms_consent_text,
         'Backfilled at SMS program launch — parent already booked before the opt-in checkbox existed. Parents may reply STOP to any text to revoke consent.')
 WHERE sms_consent = false
   AND parent_phone IS NOT NULL
   AND length(btrim(parent_phone)) >= 7;