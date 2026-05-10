ALTER TABLE public.client_credits
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS voided_reason text;

CREATE INDEX IF NOT EXISTS client_credits_available_idx
  ON public.client_credits (lower(parent_email))
  WHERE used_at IS NULL AND voided_at IS NULL;