
CREATE TABLE public.enrollment_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.swim_enrollments(id) ON DELETE CASCADE,
  waiver_accepted boolean NOT NULL DEFAULT false,
  photo_release_accepted boolean NOT NULL DEFAULT false,
  privacy_policy_accepted boolean NOT NULL DEFAULT false,
  terms_accepted boolean NOT NULL DEFAULT false,
  signature_text text NOT NULL,
  signer_name text NOT NULL,
  signer_email text NOT NULL,
  signer_ip text,
  signed_at timestamp with time zone NOT NULL DEFAULT now(),
  waiver_version text NOT NULL DEFAULT '2025-05-01',
  tos_version text NOT NULL DEFAULT '2025-05-01',
  privacy_policy_version text NOT NULL DEFAULT '2025-05-01',
  emergency_contact_name text NOT NULL,
  emergency_contact_phone text NOT NULL,
  emergency_contact_relationship text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.enrollment_agreements ENABLE ROW LEVEL SECURITY;

-- Public can insert (during enrollment)
CREATE POLICY "Anyone can submit enrollment agreements"
  ON public.enrollment_agreements FOR INSERT
  TO public
  WITH CHECK (true);

-- Only authenticated staff can view
CREATE POLICY "Authenticated users can view agreements"
  ON public.enrollment_agreements FOR SELECT
  TO authenticated
  USING (true);
