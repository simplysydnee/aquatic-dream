
-- Allow public read of active session periods via the security_invoker view.
-- Previous fix used security_invoker=off, but that was reverted to satisfy
-- the SUPA_security_definer_view security finding. With security_invoker=on,
-- the anon role needs both a SELECT grant AND an RLS policy on the underlying
-- table. This makes the public read path durable against future CREATE OR
-- REPLACE VIEW changes (which silently reset reloptions).

GRANT SELECT ON public.session_periods TO anon, authenticated;
GRANT SELECT ON public.session_periods_public TO anon, authenticated;

DROP POLICY IF EXISTS "Public can view active session periods" ON public.session_periods;
CREATE POLICY "Public can view active session periods"
  ON public.session_periods
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);
