
-- Phase 3g schema: memberships extra fields + pending_memberships staging table
ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS parent_first_name text,
  ADD COLUMN IF NOT EXISTS parent_last_name text,
  ADD COLUMN IF NOT EXISTS child_dob date,
  ADD COLUMN IF NOT EXISTS is_first_time boolean,
  ADD COLUMN IF NOT EXISTS has_medical boolean,
  ADD COLUMN IF NOT EXISTS medical_notes text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS waiver_id uuid REFERENCES public.visitor_waivers(id),
  ADD COLUMN IF NOT EXISTS sms_consent_text text,
  ADD COLUMN IF NOT EXISTS sms_consent_version text;

CREATE TABLE IF NOT EXISTS public.pending_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL,
  stripe_session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.pending_memberships TO service_role;

ALTER TABLE public.pending_memberships ENABLE ROW LEVEL SECURITY;

-- No public policies: service role only (bypasses RLS).
CREATE POLICY "pending_memberships_service_only"
  ON public.pending_memberships
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
