ALTER TABLE public.lesson_bookings
  ADD COLUMN IF NOT EXISTS confirmation_email_status text,
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_email_error text;