ALTER TABLE public.swim_enrollments
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_consent_ip text,
  ADD COLUMN IF NOT EXISTS sms_consent_version text,
  ADD COLUMN IF NOT EXISTS sms_consent_text text;

CREATE INDEX IF NOT EXISTS idx_swim_enrollments_sms_consent
  ON public.swim_enrollments (sms_consent)
  WHERE sms_consent = true;