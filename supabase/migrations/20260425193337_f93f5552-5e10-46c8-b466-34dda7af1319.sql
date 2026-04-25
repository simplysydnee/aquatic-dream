-- Instructor weekly recurring availability
CREATE TABLE public.instructor_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instructor_id UUID NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  preference TEXT NOT NULL DEFAULT 'available' CHECK (preference IN ('preferred','available','unavailable')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.instructor_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage availability" ON public.instructor_availability
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "Instructors manage own availability" ON public.instructor_availability
  FOR ALL TO authenticated
  USING (instructor_id = current_user_instructor_id())
  WITH CHECK (instructor_id = current_user_instructor_id());

CREATE POLICY "Authenticated view availability" ON public.instructor_availability
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_instructor_availability_updated
  BEFORE UPDATE ON public.instructor_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Time-off requests
CREATE TABLE public.time_off_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instructor_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT true,
  start_time TIME,
  end_time TIME,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','cancelled')),
  admin_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.time_off_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage time off" ON public.time_off_requests
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "Instructors view own time off" ON public.time_off_requests
  FOR SELECT TO authenticated
  USING (instructor_id = current_user_instructor_id());

CREATE POLICY "Instructors create own time off" ON public.time_off_requests
  FOR INSERT TO authenticated
  WITH CHECK (instructor_id = current_user_instructor_id() AND status = 'pending');

CREATE POLICY "Instructors cancel own pending time off" ON public.time_off_requests
  FOR UPDATE TO authenticated
  USING (instructor_id = current_user_instructor_id() AND status = 'pending')
  WITH CHECK (instructor_id = current_user_instructor_id() AND status IN ('pending','cancelled'));

CREATE TRIGGER trg_time_off_updated
  BEFORE UPDATE ON public.time_off_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Shift trade requests
CREATE TABLE public.shift_trade_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id UUID NOT NULL,
  from_instructor_id UUID NOT NULL,
  to_instructor_id UUID NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','approved','denied','cancelled')),
  responded_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.shift_trade_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage trades" ON public.shift_trade_requests
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "Instructors view own trades" ON public.shift_trade_requests
  FOR SELECT TO authenticated
  USING (from_instructor_id = current_user_instructor_id() OR to_instructor_id = current_user_instructor_id());

CREATE POLICY "Instructors propose trades" ON public.shift_trade_requests
  FOR INSERT TO authenticated
  WITH CHECK (from_instructor_id = current_user_instructor_id() AND status = 'pending');

CREATE POLICY "Instructors respond to trades" ON public.shift_trade_requests
  FOR UPDATE TO authenticated
  USING (
    (to_instructor_id = current_user_instructor_id() AND status = 'pending')
    OR (from_instructor_id = current_user_instructor_id() AND status IN ('pending','accepted'))
  )
  WITH CHECK (
    (to_instructor_id = current_user_instructor_id() AND status IN ('accepted','declined'))
    OR (from_instructor_id = current_user_instructor_id() AND status IN ('cancelled'))
  );

CREATE TRIGGER trg_shift_trade_updated
  BEFORE UPDATE ON public.shift_trade_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function for first-claim-wins on open shifts
CREATE OR REPLACE FUNCTION public.claim_open_shift(_shift_id UUID)
RETURNS public.shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _instructor_id UUID;
  _shift public.shifts;
BEGIN
  _instructor_id := public.current_user_instructor_id();
  IF _instructor_id IS NULL THEN
    RAISE EXCEPTION 'Not an instructor';
  END IF;

  UPDATE public.shifts
     SET instructor_id = _instructor_id,
         updated_at = now()
   WHERE id = _shift_id
     AND instructor_id IS NULL
     AND status = 'published'
   RETURNING * INTO _shift;

  IF _shift.id IS NULL THEN
    RAISE EXCEPTION 'Shift no longer available';
  END IF;

  RETURN _shift;
END;
$$;

-- Allow instructors to update shifts they own (for trade completions handled in functions)
GRANT EXECUTE ON FUNCTION public.claim_open_shift(UUID) TO authenticated;

-- Function to finalize an approved trade (admin only)
CREATE OR REPLACE FUNCTION public.approve_shift_trade(_trade_id UUID)
RETURNS public.shift_trade_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _trade public.shift_trade_requests;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO _trade FROM public.shift_trade_requests WHERE id = _trade_id;
  IF _trade.id IS NULL OR _trade.status <> 'accepted' THEN
    RAISE EXCEPTION 'Trade not in accepted state';
  END IF;

  UPDATE public.shifts
     SET instructor_id = _trade.to_instructor_id,
         updated_at = now()
   WHERE id = _trade.shift_id;

  UPDATE public.shift_trade_requests
     SET status = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now()
   WHERE id = _trade_id
   RETURNING * INTO _trade;

  RETURN _trade;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_shift_trade(UUID) TO authenticated;