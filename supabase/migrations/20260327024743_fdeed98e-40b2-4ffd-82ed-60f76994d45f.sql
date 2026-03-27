
-- Add new columns to swim_sessions
ALTER TABLE public.swim_sessions 
  ADD COLUMN IF NOT EXISTS session_name text,
  ADD COLUMN IF NOT EXISTS session_start_date date,
  ADD COLUMN IF NOT EXISTS session_end_date date,
  ADD COLUMN IF NOT EXISTS age_group text,
  ADD COLUMN IF NOT EXISTS price_per_lesson numeric DEFAULT 35,
  ADD COLUMN IF NOT EXISTS total_lessons integer DEFAULT 8,
  ADD COLUMN IF NOT EXISTS session_price numeric DEFAULT 280;

-- Change max_students default to 3
ALTER TABLE public.swim_sessions ALTER COLUMN max_students SET DEFAULT 3;

-- Delete old session data
DELETE FROM public.swim_enrollments;
DELETE FROM public.swim_sessions;
