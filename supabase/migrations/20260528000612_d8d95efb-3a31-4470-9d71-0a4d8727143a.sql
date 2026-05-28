CREATE TABLE public.visitor_waivers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  signer_first_name text NOT NULL,
  signer_last_name text NOT NULL,
  signer_email text NOT NULL,
  signer_phone text,
  signature_text text NOT NULL,
  waiver_accepted boolean NOT NULL DEFAULT false,
  terms_accepted boolean NOT NULL DEFAULT false,
  privacy_policy_accepted boolean NOT NULL DEFAULT false,
  photo_release_accepted boolean NOT NULL DEFAULT false,
  emergency_contact_first_name text,
  emergency_contact_last_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  swimmers jsonb NOT NULL DEFAULT '[]'::jsonb,
  waiver_version text NOT NULL DEFAULT '2025-05-01',
  tos_version text NOT NULL DEFAULT '2026-04-24',
  privacy_policy_version text NOT NULL DEFAULT '2025-05-01',
  signer_ip text,
  source text NOT NULL DEFAULT 'public',
  completed_by_staff_id uuid,
  email_sent_at timestamptz,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.visitor_waivers TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.visitor_waivers TO authenticated;
GRANT ALL ON public.visitor_waivers TO service_role;

ALTER TABLE public.visitor_waivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit visitor waiver"
  ON public.visitor_waivers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins view visitor waivers"
  ON public.visitor_waivers FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update visitor waivers"
  ON public.visitor_waivers FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete visitor waivers"
  ON public.visitor_waivers FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_visitor_waivers_signed_at ON public.visitor_waivers (signed_at DESC);
CREATE INDEX idx_visitor_waivers_signer_email ON public.visitor_waivers (lower(signer_email));