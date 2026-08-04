CREATE TABLE public.membership_payment_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  stripe_subscription_id text,
  stripe_customer_id text,
  stripe_object_id text,
  stripe_invoice_id text,
  amount_cents integer,
  currency text,
  status text,
  environment text NOT NULL DEFAULT 'live',
  parent_email text,
  raw jsonb,
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.membership_payment_events TO authenticated;
GRANT ALL ON public.membership_payment_events TO service_role;

ALTER TABLE public.membership_payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view membership payment events"
  ON public.membership_payment_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_mpe_membership_id ON public.membership_payment_events(membership_id);
CREATE INDEX idx_mpe_subscription_id ON public.membership_payment_events(stripe_subscription_id);
CREATE INDEX idx_mpe_occurred_at ON public.membership_payment_events(occurred_at DESC);

CREATE TRIGGER update_membership_payment_events_updated_at
  BEFORE UPDATE ON public.membership_payment_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();