ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS membership_agreement_version text,
  ADD COLUMN IF NOT EXISTS membership_agreement_text text,
  ADD COLUMN IF NOT EXISTS membership_agreement_accepted_at timestamp with time zone;