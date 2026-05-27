REVOKE EXECUTE ON FUNCTION public.get_instructors_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_instructors_admin() TO authenticated;