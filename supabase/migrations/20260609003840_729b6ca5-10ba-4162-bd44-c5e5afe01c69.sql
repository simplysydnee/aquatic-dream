
-- Restrict session_periods authenticated SELECT to admins (non-admins use session_periods_public view)
DROP POLICY IF EXISTS "Authenticated can view session periods" ON public.session_periods;
CREATE POLICY "Admins can view session periods"
  ON public.session_periods FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Hide swim_sessions.resend_audience_id from non-service roles via column privileges
REVOKE SELECT (resend_audience_id) ON public.swim_sessions FROM anon, authenticated;

-- Tighten slot_holds INSERT policy with basic session_token sanity check
DROP POLICY IF EXISTS "Anyone can create slot holds" ON public.slot_holds;
CREATE POLICY "Anyone can create slot holds"
  ON public.slot_holds FOR INSERT
  WITH CHECK (
    session_token IS NOT NULL
    AND char_length(session_token) >= 16
    AND (held_until IS NULL OR held_until <= now() + interval '30 minutes')
  );
