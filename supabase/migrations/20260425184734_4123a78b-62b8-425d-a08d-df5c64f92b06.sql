
-- Positions / roles for color-coded shifts
CREATE TABLE public.shift_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#2a5e84',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shift_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view positions"
  ON public.shift_positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage positions"
  ON public.shift_positions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_shift_positions_updated_at
  BEFORE UPDATE ON public.shift_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Shifts
CREATE TABLE public.shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instructor_id UUID NULL REFERENCES public.instructors(id) ON DELETE SET NULL,
  position_id UUID NULL REFERENCES public.shift_positions(id) ON DELETE SET NULL,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT,
  color TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  swim_session_id UUID NULL REFERENCES public.swim_sessions(id) ON DELETE SET NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shifts_date ON public.shifts(shift_date);
CREATE INDEX idx_shifts_instructor_date ON public.shifts(instructor_id, shift_date);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view shifts"
  ON public.shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage shifts"
  ON public.shifts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Schedule publications (one per published week)
CREATE TABLE public.schedule_publications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID NULL
);

ALTER TABLE public.schedule_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view publications"
  ON public.schedule_publications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage publications"
  ON public.schedule_publications FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed default positions
INSERT INTO public.shift_positions (name, color) VALUES
  ('Lesson', '#2a5e84'),
  ('Lifeguard', '#F58B76'),
  ('Front Desk', '#1a3a8a'),
  ('Private Lesson', '#0ea5e9');
