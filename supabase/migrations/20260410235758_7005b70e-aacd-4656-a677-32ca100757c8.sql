
CREATE TABLE public.instructors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.instructors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view instructors"
  ON public.instructors FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage instructors"
  ON public.instructors FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_instructors_updated_at
  BEFORE UPDATE ON public.instructors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.swim_sessions
  ADD COLUMN instructor_id uuid REFERENCES public.instructors(id),
  ADD COLUMN registration_status text NOT NULL DEFAULT 'open';
