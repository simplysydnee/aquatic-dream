-- Restrict public SELECT on slot_holds; expose minimal data via SECURITY DEFINER RPC.

DROP POLICY IF EXISTS "Anyone can view active slot holds" ON public.slot_holds;
DROP POLICY IF EXISTS "Anyone can view slot holds" ON public.slot_holds;

REVOKE SELECT ON public.slot_holds FROM anon, authenticated;

CREATE POLICY "Service role reads slot holds"
  ON public.slot_holds FOR SELECT
  USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.get_active_slot_holds(
  p_from_date date,
  p_to_date date,
  p_session_token text DEFAULT NULL
)
RETURNS TABLE(instructor_id uuid, slot_date date, start_time time)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.instructor_id, h.slot_date, h.start_time
    FROM public.slot_holds h
   WHERE h.slot_date BETWEEN p_from_date AND p_to_date
     AND h.held_until > now()
     AND (p_session_token IS NULL OR h.session_token <> p_session_token);
$$;

REVOKE ALL ON FUNCTION public.get_active_slot_holds(date, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_active_slot_holds(date, date, text) TO anon, authenticated, service_role;