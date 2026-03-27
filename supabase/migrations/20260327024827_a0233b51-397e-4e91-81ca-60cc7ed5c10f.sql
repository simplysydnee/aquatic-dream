
-- Drop old check constraints
ALTER TABLE public.swim_sessions DROP CONSTRAINT swim_sessions_day_of_week_check;
ALTER TABLE public.swim_sessions DROP CONSTRAINT swim_sessions_swim_level_check;

-- Add new constraints
ALTER TABLE public.swim_sessions ADD CONSTRAINT swim_sessions_day_of_week_check 
  CHECK (day_of_week = ANY (ARRAY['monday'::text, 'tuesday'::text, 'wednesday'::text, 'thursday'::text, 'friday'::text, 'saturday'::text, 'sunday'::text, 'monday_wednesday'::text]));

ALTER TABLE public.swim_sessions ADD CONSTRAINT swim_sessions_swim_level_check 
  CHECK (swim_level = ANY (ARRAY['white'::text, 'red'::text, 'yellow'::text, 'blue'::text, 'green'::text, 'stroke-school'::text]));
