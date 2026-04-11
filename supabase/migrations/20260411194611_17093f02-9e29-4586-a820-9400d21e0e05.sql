
-- Add payment tracking columns to swim_enrollments
ALTER TABLE public.swim_enrollments 
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_amount numeric NULL,
  ADD COLUMN IF NOT EXISTS stripe_payment_id text NULL,
  ADD COLUMN IF NOT EXISTS is_first_time boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_due_date date NULL,
  ADD COLUMN IF NOT EXISTS payment_reminder_sent_at timestamp with time zone NULL;

-- Update default status from 'pending' to 'enrolled'
ALTER TABLE public.swim_enrollments ALTER COLUMN status SET DEFAULT 'enrolled';
