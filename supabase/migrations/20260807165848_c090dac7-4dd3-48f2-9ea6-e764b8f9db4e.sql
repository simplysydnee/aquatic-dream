ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS card_link_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS card_updated_at timestamptz;