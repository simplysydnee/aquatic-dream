-- 1) Clean up: any non-paid row with a cs_ in stripe_session_id → move to stripe_checkout_url, clear stripe_session_id
UPDATE public.lesson_booking_occurrences
   SET stripe_checkout_url = COALESCE(stripe_checkout_url, stripe_session_id),
       stripe_session_id = NULL
 WHERE payment_status <> 'paid'
   AND stripe_session_id IS NOT NULL
   AND stripe_session_id LIKE 'cs_%';

-- 2) Also clean any "paid" row that somehow only has a cs_ id (no pi_), demote to flagged_no_pay
UPDATE public.lesson_booking_occurrences
   SET payment_status = 'flagged_no_pay',
       stripe_checkout_url = COALESCE(stripe_checkout_url, stripe_session_id),
       stripe_session_id = NULL,
       paid_at = NULL
 WHERE payment_status = 'paid'
   AND stripe_session_id LIKE 'cs_%'
   AND payment_method IS NULL;

-- 3) Constraint: paid rows must have proof
ALTER TABLE public.lesson_booking_occurrences
  DROP CONSTRAINT IF EXISTS lesson_occ_paid_requires_proof;

ALTER TABLE public.lesson_booking_occurrences
  ADD CONSTRAINT lesson_occ_paid_requires_proof CHECK (
    payment_status <> 'paid'
    OR (stripe_session_id IS NOT NULL AND stripe_session_id LIKE 'pi_%')
    OR (payment_method IS NOT NULL AND payment_reference IS NOT NULL)
  );