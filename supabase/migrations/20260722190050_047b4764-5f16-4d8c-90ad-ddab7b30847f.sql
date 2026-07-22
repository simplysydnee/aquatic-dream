ALTER TABLE public.membership_plans
  ADD COLUMN IF NOT EXISTS stripe_product_id_sandbox text,
  ADD COLUMN IF NOT EXISTS stripe_price_id_sandbox text,
  ADD COLUMN IF NOT EXISTS stripe_product_id_live text,
  ADD COLUMN IF NOT EXISTS stripe_price_id_live text;

-- Migrate the existing (live) values into the live-specific columns
UPDATE public.membership_plans
SET stripe_product_id_live = COALESCE(stripe_product_id_live, stripe_product_id),
    stripe_price_id_live   = COALESCE(stripe_price_id_live,   stripe_price_id);