
-- Create lesson_requests table for private/semi-private requests
CREATE TABLE public.lesson_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_name TEXT NOT NULL,
  parent_email TEXT NOT NULL,
  parent_phone TEXT,
  child_name TEXT NOT NULL,
  child_age INTEGER NOT NULL,
  lesson_type TEXT NOT NULL DEFAULT 'private',
  preferred_times TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit lesson request"
ON public.lesson_requests FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Authenticated users can view lesson requests"
ON public.lesson_requests FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can update lesson requests"
ON public.lesson_requests FOR UPDATE
TO authenticated
USING (true);

-- Add lesson_type to swim_enrollments
ALTER TABLE public.swim_enrollments
  ADD COLUMN IF NOT EXISTS lesson_type TEXT NOT NULL DEFAULT 'group';

-- Add registration_fee column
ALTER TABLE public.swim_enrollments
  ADD COLUMN IF NOT EXISTS registration_fee NUMERIC DEFAULT 45;

-- Update any stroke-school enrollments to green
UPDATE public.swim_enrollments SET swim_level = 'green' WHERE swim_level = 'stroke-school';

-- Deactivate old age group sessions (will be replaced with new seed data)
UPDATE public.swim_sessions SET is_active = false WHERE age_group = 'advanced-7+';
UPDATE public.swim_sessions SET is_active = false WHERE age_group = 'school-5-8';

-- Add updated_at trigger for lesson_requests
CREATE TRIGGER update_lesson_requests_updated_at
BEFORE UPDATE ON public.lesson_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
