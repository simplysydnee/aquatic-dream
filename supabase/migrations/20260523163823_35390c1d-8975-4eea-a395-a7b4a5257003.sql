
-- 1. enrollment_agreements: admin-only SELECT
DROP POLICY IF EXISTS "Authenticated users can view agreements" ON public.enrollment_agreements;
CREATE POLICY "Admins view enrollment agreements"
  ON public.enrollment_agreements FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. instructors: revoke column-level access to hourly_wage so authenticated
-- users (incl. other instructors) cannot read it via the table. Admins read
-- it via the get_instructor_wages() SECURITY DEFINER RPC below.
REVOKE SELECT (hourly_wage) ON public.instructors FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_instructor_wages()
RETURNS TABLE(id uuid, hourly_wage numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY SELECT i.id, i.hourly_wage FROM public.instructors i;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_instructor_wages() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_instructor_wages() TO authenticated;

-- 3. trip_reservations: admin-only SELECT/UPDATE
DROP POLICY IF EXISTS "Authenticated users can view trip reservations" ON public.trip_reservations;
DROP POLICY IF EXISTS "Authenticated users can update trip reservations" ON public.trip_reservations;
CREATE POLICY "Admins view trip reservations"
  ON public.trip_reservations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update trip reservations"
  ON public.trip_reservations FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete trip reservations"
  ON public.trip_reservations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
