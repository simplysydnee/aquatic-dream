CREATE OR REPLACE FUNCTION public.enforce_first_time_swimmer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  prior_count INTEGER;
BEGIN
  -- If the inserter (webhook, admin path) explicitly stamped both
  -- is_first_time and registration_fee, trust them. They know what
  -- Stripe actually charged. This avoids silently flipping returning
  -- customers to first-time when they're enrolling a child whose name
  -- doesn't yet appear in the DB.
  IF NEW.is_first_time IS NOT NULL AND NEW.registration_fee IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Legacy / partial-insert safety net: detect from history.
  SELECT COUNT(*) INTO prior_count
  FROM public.swim_enrollments
  WHERE lower(parent_email) = lower(NEW.parent_email)
    AND lower(trim(child_name)) = lower(trim(NEW.child_name))
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF prior_count = 0 THEN
    NEW.is_first_time := COALESCE(NEW.is_first_time, true);
    NEW.registration_fee := COALESCE(NEW.registration_fee, 45);
  ELSE
    NEW.is_first_time := COALESCE(NEW.is_first_time, false);
    NEW.registration_fee := COALESCE(NEW.registration_fee, 0);
  END IF;

  RETURN NEW;
END;
$$;