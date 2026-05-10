-- Cancellation & credit fields for calendar cancel/reassign workflows

ALTER TABLE public.session_lesson_dates
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS instructor_override_id uuid;

ALTER TABLE public.lesson_booking_occurrences
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

CREATE TABLE IF NOT EXISTS public.client_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_email text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  source text NOT NULL,
  source_ref uuid,
  note text,
  used_at timestamptz,
  used_against text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS client_credits_email_idx
  ON public.client_credits (lower(parent_email));

ALTER TABLE public.client_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage client credits"
  ON public.client_credits FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages client credits"
  ON public.client_credits FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');