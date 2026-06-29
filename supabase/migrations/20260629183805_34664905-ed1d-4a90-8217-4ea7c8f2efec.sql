ALTER TABLE public.lesson_bookings
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS lesson_bookings_idempotency_key_uniq
  ON public.lesson_bookings(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.card_reuse_tokens (
  token                     text PRIMARY KEY,
  parent_email              text NOT NULL,
  stripe_customer_id        text NOT NULL,
  stripe_payment_method_id  text NOT NULL,
  brand                     text,
  last4                     text,
  exp_month                 int,
  exp_year                  int,
  source_booking_id         uuid,
  expires_at                timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at               timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.card_reuse_tokens TO service_role;

ALTER TABLE public.card_reuse_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role only access" ON public.card_reuse_tokens;
CREATE POLICY "service role only access"
  ON public.card_reuse_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);