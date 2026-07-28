ALTER TABLE public.membership_occurrences
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by text NULL;