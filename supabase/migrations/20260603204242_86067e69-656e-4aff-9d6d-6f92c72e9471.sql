
ALTER TABLE public.swim_sessions ADD COLUMN IF NOT EXISTS resend_audience_id TEXT;
ALTER TABLE public.session_periods ADD COLUMN IF NOT EXISTS resend_audience_id TEXT;

CREATE TABLE IF NOT EXISTS public.resend_level_audiences (
  level TEXT PRIMARY KEY,
  resend_audience_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.resend_level_audiences TO authenticated;
GRANT ALL ON public.resend_level_audiences TO service_role;

ALTER TABLE public.resend_level_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage level audiences"
  ON public.resend_level_audiences
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages level audiences"
  ON public.resend_level_audiences
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
