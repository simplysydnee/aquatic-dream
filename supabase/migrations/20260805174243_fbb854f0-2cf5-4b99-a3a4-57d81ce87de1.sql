ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS last_invoice_id text,
  ADD COLUMN IF NOT EXISTS last_payment_status text,
  ADD COLUMN IF NOT EXISTS last_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_amount_cents integer,
  ADD COLUMN IF NOT EXISTS payment_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_failure_reason text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text;

-- Backfill from the existing append-only ledger: most recent invoice outcome
-- per membership wins.
WITH latest AS (
  SELECT DISTINCT ON (membership_id)
    membership_id,
    event_type,
    stripe_invoice_id,
    amount_cents,
    occurred_at,
    raw
  FROM public.membership_payment_events
  WHERE membership_id IS NOT NULL
    AND event_type IN ('invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed')
  ORDER BY membership_id, occurred_at DESC
),
last_success AS (
  SELECT membership_id, max(occurred_at) AS at
  FROM public.membership_payment_events
  WHERE membership_id IS NOT NULL
    AND event_type IN ('invoice.paid', 'invoice.payment_succeeded')
  GROUP BY membership_id
),
fail_counts AS (
  SELECT e.membership_id, count(DISTINCT e.stripe_invoice_id) AS n
  FROM public.membership_payment_events e
  LEFT JOIN last_success s ON s.membership_id = e.membership_id
  WHERE e.membership_id IS NOT NULL
    AND e.event_type = 'invoice.payment_failed'
    AND (s.at IS NULL OR e.occurred_at > s.at)
  GROUP BY e.membership_id
)
UPDATE public.memberships m
SET last_invoice_id = l.stripe_invoice_id,
    last_payment_status = CASE WHEN l.event_type = 'invoice.payment_failed' THEN 'failed' ELSE 'paid' END,
    last_payment_at = l.occurred_at,
    last_payment_amount_cents = l.amount_cents,
    payment_failure_count = COALESCE(f.n, 0),
    payment_failure_reason = CASE WHEN l.event_type = 'invoice.payment_failed' THEN l.raw->>'reason' ELSE NULL END
FROM latest l
LEFT JOIN fail_counts f ON f.membership_id = l.membership_id
WHERE m.id = l.membership_id;