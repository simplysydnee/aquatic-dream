
ALTER TABLE public.lesson_booking_occurrences
  ADD COLUMN IF NOT EXISTS instructor_override_id uuid REFERENCES public.instructors(id),
  ADD COLUMN IF NOT EXISTS instructor_override_name text,
  ADD COLUMN IF NOT EXISTS start_time_override time without time zone,
  ADD COLUMN IF NOT EXISTS end_time_override time without time zone;
