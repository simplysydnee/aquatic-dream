CREATE TABLE public.enrollment_date_moves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID NOT NULL REFERENCES public.swim_enrollments(id) ON DELETE CASCADE,
  lesson_date DATE NOT NULL,
  target_session_id UUID NOT NULL REFERENCES public.swim_sessions(id) ON DELETE CASCADE,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, lesson_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollment_date_moves TO authenticated;
GRANT ALL ON public.enrollment_date_moves TO service_role;

ALTER TABLE public.enrollment_date_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage enrollment date moves"
  ON public.enrollment_date_moves
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_enrollment_date_moves_date ON public.enrollment_date_moves(lesson_date);
CREATE INDEX idx_enrollment_date_moves_target ON public.enrollment_date_moves(target_session_id, lesson_date);

CREATE TRIGGER update_enrollment_date_moves_updated_at
  BEFORE UPDATE ON public.enrollment_date_moves
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();