
ALTER TABLE public.lesson_bookings
  ADD COLUMN IF NOT EXISTS partner_swimmer_first_name text,
  ADD COLUMN IF NOT EXISTS partner_swimmer_last_name text,
  ADD COLUMN IF NOT EXISTS partner_parent_name text,
  ADD COLUMN IF NOT EXISTS partner_parent_email text,
  ADD COLUMN IF NOT EXISTS partner_parent_phone text;
