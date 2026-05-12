ALTER TABLE public.lesson_booking_occurrences
  ADD COLUMN IF NOT EXISTS payment_link_email_status text,
  ADD COLUMN IF NOT EXISTS payment_link_email_error text;