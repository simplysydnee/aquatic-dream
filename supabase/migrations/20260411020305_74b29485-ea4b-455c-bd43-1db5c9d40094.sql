CREATE TABLE public.session_lesson_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.swim_sessions(id) ON DELETE CASCADE,
  lesson_date date NOT NULL,
  is_cancelled boolean NOT NULL DEFAULT false,
  cancel_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (session_id, lesson_date)
);

ALTER TABLE public.session_lesson_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view class dates"
ON public.session_lesson_dates
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can manage class dates"
ON public.session_lesson_dates
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);