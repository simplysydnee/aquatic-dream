
ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS manage_token uuid NOT NULL DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'memberships_manage_token_key'
  ) THEN
    CREATE UNIQUE INDEX memberships_manage_token_key ON public.memberships(manage_token);
  END IF;
END$$;

-- Backfill any nulls (defensive; column is NOT NULL DEFAULT already)
UPDATE public.memberships SET manage_token = gen_random_uuid() WHERE manage_token IS NULL;
