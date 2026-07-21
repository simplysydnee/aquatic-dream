
UPDATE public.membership_plans SET name = 'Small Group Swim' WHERE plan_key = 'kid_group';
UPDATE public.membership_plans SET name = 'Private Swim'     WHERE plan_key = 'private';
UPDATE public.membership_plans SET name = 'Adult Swim'       WHERE plan_key = 'adult_group';

ALTER TABLE public.standing_slots
  ADD COLUMN IF NOT EXISTS swim_level text
    CHECK (swim_level IS NULL OR swim_level IN ('white','red','yellow','blue','green'));
