-- Add wage to instructors
ALTER TABLE public.instructors
  ADD COLUMN IF NOT EXISTS hourly_wage NUMERIC(8,2);

-- Time clock entries
CREATE TABLE public.time_clock_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instructor_id UUID NOT NULL,
  shift_id UUID,
  clock_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out_at TIMESTAMPTZ,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  edited_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tce_instructor_date ON public.time_clock_entries (instructor_id, clock_in_at);
ALTER TABLE public.time_clock_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage time clock" ON public.time_clock_entries
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "Instructors view own punches" ON public.time_clock_entries
  FOR SELECT TO authenticated
  USING (instructor_id = current_user_instructor_id());

CREATE POLICY "Instructors insert own punches" ON public.time_clock_entries
  FOR INSERT TO authenticated
  WITH CHECK (instructor_id = current_user_instructor_id());

CREATE POLICY "Instructors update own pending punches" ON public.time_clock_entries
  FOR UPDATE TO authenticated
  USING (instructor_id = current_user_instructor_id() AND status = 'pending')
  WITH CHECK (instructor_id = current_user_instructor_id() AND status = 'pending');

CREATE TRIGGER trg_time_clock_updated
  BEFORE UPDATE ON public.time_clock_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Clock-in helper: closes any stray open punches and opens a new one
CREATE OR REPLACE FUNCTION public.clock_in(_shift_id UUID DEFAULT NULL, _notes TEXT DEFAULT NULL)
RETURNS public.time_clock_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _entry public.time_clock_entries;
BEGIN
  _id := public.current_user_instructor_id();
  IF _id IS NULL THEN RAISE EXCEPTION 'Not an instructor'; END IF;

  -- Auto-close any open punches first
  UPDATE public.time_clock_entries
     SET clock_out_at = now()
   WHERE instructor_id = _id AND clock_out_at IS NULL;

  INSERT INTO public.time_clock_entries (instructor_id, shift_id, notes)
  VALUES (_id, _shift_id, _notes)
  RETURNING * INTO _entry;

  RETURN _entry;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_in(UUID, TEXT) TO authenticated;

-- Clock-out helper: closes the active punch
CREATE OR REPLACE FUNCTION public.clock_out(_break_minutes INTEGER DEFAULT 0, _notes TEXT DEFAULT NULL)
RETURNS public.time_clock_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _entry public.time_clock_entries;
BEGIN
  _id := public.current_user_instructor_id();
  IF _id IS NULL THEN RAISE EXCEPTION 'Not an instructor'; END IF;

  UPDATE public.time_clock_entries
     SET clock_out_at = now(),
         break_minutes = COALESCE(_break_minutes, 0),
         notes = COALESCE(_notes, notes)
   WHERE instructor_id = _id AND clock_out_at IS NULL
   RETURNING * INTO _entry;

  IF _entry.id IS NULL THEN RAISE EXCEPTION 'No open punch to close'; END IF;
  RETURN _entry;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clock_out(INTEGER, TEXT) TO authenticated;