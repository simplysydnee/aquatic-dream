-- Restore guest access to active session periods (regression fix)
GRANT SELECT ON public.session_periods TO anon, authenticated;
GRANT ALL ON public.session_periods TO service_role;

GRANT SELECT ON public.session_periods_public TO anon, authenticated;
GRANT ALL ON public.session_periods_public TO service_role;

-- Regression guard: verifies required grants and policy still exist.
CREATE OR REPLACE FUNCTION public.check_session_periods_public_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _anon_view boolean;
  _anon_table boolean;
  _auth_view boolean;
  _auth_table boolean;
  _policy boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_schema = 'public'
      AND table_name = 'session_periods_public' AND privilege_type = 'SELECT'
  ) INTO _anon_view;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_schema = 'public'
      AND table_name = 'session_periods' AND privilege_type = 'SELECT'
  ) INTO _anon_table;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated' AND table_schema = 'public'
      AND table_name = 'session_periods_public' AND privilege_type = 'SELECT'
  ) INTO _auth_view;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated' AND table_schema = 'public'
      AND table_name = 'session_periods' AND privilege_type = 'SELECT'
  ) INTO _auth_table;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'session_periods'
      AND policyname = 'Public can view active session periods'
  ) INTO _policy;

  RETURN jsonb_build_object(
    'anon_select_view', _anon_view,
    'anon_select_table', _anon_table,
    'authenticated_select_view', _auth_view,
    'authenticated_select_table', _auth_table,
    'active_period_policy', _policy,
    'ok', _anon_view AND _anon_table AND _auth_view AND _auth_table AND _policy
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_session_periods_public_access() TO anon, authenticated, service_role;