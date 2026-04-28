-- Add refund tracking columns to swim_enrollments
ALTER TABLE public.swim_enrollments
  ADD COLUMN IF NOT EXISTS session_fee_refund_stripe_id text,
  ADD COLUMN IF NOT EXISTS session_fee_refund_amount numeric,
  ADD COLUMN IF NOT EXISTS session_fee_refund_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_fee_refund_reason text;

-- Reconciliation alerts table for over/undercharges
CREATE TABLE IF NOT EXISTS public.payment_reconciliation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_checkout_session_id text NOT NULL,
  expected_amount numeric NOT NULL,
  actual_amount numeric NOT NULL,
  delta numeric NOT NULL,
  direction text NOT NULL CHECK (direction IN ('overcharge','undercharge')),
  enrollment_ids uuid[],
  customer_email text,
  resolved_at timestamptz,
  resolved_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_alerts_unresolved
  ON public.payment_reconciliation_alerts(created_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.payment_reconciliation_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage reconciliation alerts"
  ON public.payment_reconciliation_alerts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages reconciliation alerts"
  ON public.payment_reconciliation_alerts
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');