ALTER VIEW public.session_periods_public SET (security_invoker = off);
GRANT SELECT ON public.session_periods_public TO anon, authenticated;