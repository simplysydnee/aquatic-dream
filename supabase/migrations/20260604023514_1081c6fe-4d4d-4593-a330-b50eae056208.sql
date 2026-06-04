ALTER TABLE public.swim_enrollments
  ADD COLUMN IF NOT EXISTS session_fee_payment_link_id text,
  ADD COLUMN IF NOT EXISTS session_fee_payment_link_url text,
  ADD COLUMN IF NOT EXISTS session_welcome_sent_at timestamp with time zone;