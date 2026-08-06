ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'public';
CREATE INDEX IF NOT EXISTS idx_memberships_source ON public.memberships (source);