DROP POLICY IF EXISTS "Anyone can delete own slot holds" ON public.slot_holds;

CREATE OR REPLACE FUNCTION public.release_slot_holds(p_session_token text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_session_token IS NULL OR length(p_session_token) < 8 THEN
    RETURN 0;
  END IF;

  DELETE FROM public.slot_holds
   WHERE session_token = p_session_token;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.release_slot_holds(text) FROM public;
GRANT EXECUTE ON FUNCTION public.release_slot_holds(text) TO anon, authenticated, service_role;