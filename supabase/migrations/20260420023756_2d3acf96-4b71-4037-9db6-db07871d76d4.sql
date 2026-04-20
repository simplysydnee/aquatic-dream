-- Add session fee tracking columns separate from registration fee
ALTER TABLE public.swim_enrollments
  ADD COLUMN session_fee_status text NOT NULL DEFAULT 'due_day_1',
  ADD COLUMN session_fee_stripe_id text,
  ADD COLUMN session_fee_paid_at timestamp with time zone;

ALTER TABLE public.swim_enrollments
  ADD CONSTRAINT swim_enrollments_session_fee_status_check
  CHECK (session_fee_status IN ('paid', 'due_day_1', 'comp'));

-- Backfill existing rows
-- Aniya: returning, paid full $240 via Stripe
UPDATE public.swim_enrollments
  SET session_fee_status = 'paid',
      session_fee_stripe_id = stripe_payment_id,
      session_fee_paid_at = updated_at
  WHERE id = 'd597b50d-783c-4139-91b3-d8267bcd3bce';

-- All others (Destiny x2, Mejia x2, Erwins x2): session fee due day 1
UPDATE public.swim_enrollments
  SET session_fee_status = 'due_day_1'
  WHERE id IN (
    '5aa793bd-aeec-4aee-9c3b-039393e806fd',
    '7e1e8c76-3a10-4999-9975-ce2dbc8b8e60',
    '48d48642-8ff8-4909-9ece-66e7bfecc8ca',
    'c34ee5ee-ef26-4065-90f3-c0b5568a0e9f',
    '5633ba1b-c643-45bf-9b70-e4e9f219692b',
    'c3e95366-2912-43ef-8577-28436d8fcf88'
  );