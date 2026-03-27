
-- Pool events: rentals, block-outs, dive sessions, i-can-swim blocks
CREATE TABLE public.pool_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('i-can-swim', 'dive-session', 'pool-rental', 'maintenance', 'other')),
  title text NOT NULL,
  event_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  pool_area text NOT NULL DEFAULT 'full' CHECK (pool_area IN ('shallow', 'deep', 'full')),
  instructor_name text,
  notes text,
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_day text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pool_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view pool events" ON public.pool_events FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated users can manage pool events" ON public.pool_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Attendance tracking for swim enrollments
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.swim_enrollments(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.swim_sessions(id) ON DELETE CASCADE,
  lesson_date date NOT NULL,
  checked_in boolean NOT NULL DEFAULT false,
  checked_in_at timestamp with time zone,
  checked_in_by text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, lesson_date)
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view attendance" ON public.attendance FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert attendance" ON public.attendance FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update attendance" ON public.attendance FOR UPDATE TO public USING (true);
CREATE POLICY "Authenticated users can delete attendance" ON public.attendance FOR DELETE TO authenticated USING (true);
