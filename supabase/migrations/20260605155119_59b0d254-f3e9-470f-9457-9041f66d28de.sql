
-- 1. Tighten instructors table: drop broad authenticated read, replace with self-only.
DROP POLICY IF EXISTS "Authenticated view instructors" ON public.instructors;

CREATE POLICY "Instructors view own record"
  ON public.instructors
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2. Public-safe directory view exposing only id/name/is_active.
CREATE OR REPLACE VIEW public.instructors_public
WITH (security_invoker = true)
AS
SELECT id, name, is_active
  FROM public.instructors
 WHERE is_active = true;

-- The view bypasses RLS via a SECURITY DEFINER wrapper function approach:
-- since security_invoker=true respects caller RLS, and callers may be anon,
-- we expose a SECURITY DEFINER function instead.
DROP VIEW public.instructors_public;

CREATE OR REPLACE FUNCTION public.get_active_instructors_public()
RETURNS TABLE(id uuid, name text, is_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, is_active
    FROM public.instructors
   WHERE is_active = true
   ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_instructors_public() TO anon, authenticated;

-- 3. Add scoped SELECT for instructors on their own lesson_bookings (defensive,
-- so future client code never needs the service role).
CREATE POLICY "Instructors view own lesson bookings"
  ON public.lesson_bookings
  FOR SELECT
  TO authenticated
  USING (instructor_id = public.current_user_instructor_id());
