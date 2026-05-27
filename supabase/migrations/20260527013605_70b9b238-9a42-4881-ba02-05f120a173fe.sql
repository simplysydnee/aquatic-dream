-- 1) pool_events: remove blanket authenticated SELECT; admins keep full access via existing ALL policy
DROP POLICY IF EXISTS "Authenticated view pool events" ON public.pool_events;

-- 2) instructors: restrict column-level SELECT for the authenticated role
REVOKE SELECT ON public.instructors FROM authenticated;
GRANT SELECT (id, name, is_active, user_id, created_at, updated_at) ON public.instructors TO authenticated;

-- 3) Admin-only RPC returning the full instructor record (incl. email, phone, hourly_wage)
CREATE OR REPLACE FUNCTION public.get_instructors_admin()
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  hourly_wage numeric,
  is_active boolean,
  user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY
    SELECT i.id, i.name, i.email, i.phone, i.hourly_wage, i.is_active, i.user_id, i.created_at, i.updated_at
      FROM public.instructors i
     ORDER BY i.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_instructors_admin() TO authenticated;