CREATE TABLE public.sms_opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  opted_out_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'inbound_sms',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sms_opt_outs TO authenticated;
GRANT ALL ON public.sms_opt_outs TO service_role;

ALTER TABLE public.sms_opt_outs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sms opt outs"
ON public.sms_opt_outs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));