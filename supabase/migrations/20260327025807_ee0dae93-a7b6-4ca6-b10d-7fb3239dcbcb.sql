
ALTER TABLE public.swim_enrollments DROP CONSTRAINT swim_enrollments_swim_level_check;
ALTER TABLE public.swim_enrollments ADD CONSTRAINT swim_enrollments_swim_level_check 
  CHECK (swim_level = ANY (ARRAY['white'::text, 'red'::text, 'yellow'::text, 'blue'::text, 'green'::text, 'stroke-school'::text]));
