ALTER TABLE public.lesson_booking_occurrences
  DROP CONSTRAINT IF EXISTS lesson_occ_paid_requires_proof;

ALTER TABLE public.lesson_booking_occurrences
  ADD CONSTRAINT lesson_occ_paid_requires_proof CHECK (
    payment_status <> 'paid'
    OR (stripe_session_id IS NOT NULL AND stripe_session_id LIKE 'pi_%')
    OR payment_method IS NOT NULL
  );