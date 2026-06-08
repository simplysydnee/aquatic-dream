
-- 1) swim_sessions: revoke broad SELECT and re-grant per-column except resend_audience_id
REVOKE SELECT ON public.swim_sessions FROM anon, authenticated;
GRANT SELECT (id, swim_level, day_of_week, start_time, end_time, max_students, is_active,
              created_at, updated_at, session_name, session_start_date, session_end_date,
              age_group, price_per_lesson, total_lessons, session_price, instructor_id,
              registration_status, session_period_id)
  ON public.swim_sessions TO anon, authenticated;

-- 2) session_periods: same treatment
REVOKE SELECT ON public.session_periods FROM anon, authenticated;
GRANT SELECT (id, name, start_date, end_date, is_active, created_at, updated_at)
  ON public.session_periods TO anon, authenticated;

-- 3) Admin-only RPC for the marketing screen to read audience IDs
CREATE OR REPLACE FUNCTION public.get_resend_audience_mappings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _periods jsonb;
  _sessions jsonb;
  _levels jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'is_active', is_active, 'resend_audience_id', resend_audience_id
  ) ORDER BY start_date DESC), '[]'::jsonb) INTO _periods
  FROM public.session_periods;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'session_name', session_name, 'swim_level', swim_level,
    'day_of_week', day_of_week, 'start_time', start_time,
    'is_active', is_active, 'resend_audience_id', resend_audience_id
  ) ORDER BY swim_level), '[]'::jsonb) INTO _sessions
  FROM public.swim_sessions WHERE is_active = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'level', level, 'resend_audience_id', resend_audience_id
  )), '[]'::jsonb) INTO _levels
  FROM public.resend_level_audiences;

  RETURN jsonb_build_object('periods', _periods, 'sessions', _sessions, 'levels', _levels);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_resend_audience_mappings() TO authenticated;

-- 4) instructor_booking_blocks: remove public direct access, expose via RPC
DROP POLICY IF EXISTS "Anyone can view booking blocks" ON public.instructor_booking_blocks;

CREATE OR REPLACE FUNCTION public.get_public_booking_blocks(_instructor_ids uuid[] DEFAULT NULL)
RETURNS SETOF public.instructor_booking_blocks
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
    FROM public.instructor_booking_blocks
   WHERE is_blackout = false
     AND (_instructor_ids IS NULL OR instructor_id = ANY(_instructor_ids));
$$;
GRANT EXECUTE ON FUNCTION public.get_public_booking_blocks(uuid[]) TO anon, authenticated;
