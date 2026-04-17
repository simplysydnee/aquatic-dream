-- Function to enforce true first-time swimmer detection
CREATE OR REPLACE FUNCTION public.enforce_first_time_swimmer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prior_count INTEGER;
BEGIN
  -- Count prior committed enrollments for this parent+child combo
  SELECT COUNT(*) INTO prior_count
  FROM public.swim_enrollments
  WHERE lower(parent_email) = lower(NEW.parent_email)
    AND lower(trim(child_name)) = lower(trim(NEW.child_name))
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- If zero prior records, this child is genuinely a first-time swimmer
  -- Override whatever the client sent
  IF prior_count = 0 THEN
    NEW.is_first_time := true;
    NEW.registration_fee := 45;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger fires before insert on swim_enrollments
DROP TRIGGER IF EXISTS trg_enforce_first_time_swimmer ON public.swim_enrollments;
CREATE TRIGGER trg_enforce_first_time_swimmer
  BEFORE INSERT ON public.swim_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_first_time_swimmer();