REVOKE SELECT (resend_audience_id) ON public.swim_sessions FROM anon, authenticated;
REVOKE SELECT (resend_audience_id) ON public.session_periods FROM anon, authenticated;
GRANT SELECT (resend_audience_id), UPDATE (resend_audience_id) ON public.swim_sessions TO service_role;
GRANT SELECT (resend_audience_id), UPDATE (resend_audience_id) ON public.session_periods TO service_role;