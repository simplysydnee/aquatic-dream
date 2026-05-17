
-- Add waiver token + signed timestamp to swim_enrollments
ALTER TABLE public.swim_enrollments
  ADD COLUMN IF NOT EXISTS waiver_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS waiver_signed_at timestamptz;

-- Trigger to auto-generate waiver_token on insert for first-time enrollments
CREATE OR REPLACE FUNCTION public.set_enrollment_waiver_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_first_time IS TRUE AND NEW.waiver_token IS NULL THEN
    NEW.waiver_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_enrollment_waiver_token ON public.swim_enrollments;
CREATE TRIGGER trg_set_enrollment_waiver_token
BEFORE INSERT ON public.swim_enrollments
FOR EACH ROW
EXECUTE FUNCTION public.set_enrollment_waiver_token();

-- Backfill for existing first-time enrollments missing a token
UPDATE public.swim_enrollments
   SET waiver_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
 WHERE is_first_time = true AND waiver_token IS NULL;

-- RPC: fetch enrollment by waiver token (public, security definer)
CREATE OR REPLACE FUNCTION public.get_swim_enrollment_by_waiver_token(_token text)
RETURNS TABLE(
  id uuid,
  parent_name text,
  parent_email text,
  child_name text,
  swim_level text,
  payment_status text,
  is_first_time boolean,
  waiver_signed_at timestamptz,
  session_name text,
  session_day text,
  session_start_time time,
  session_start_date date
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.parent_name, e.parent_email, e.child_name, e.swim_level,
         e.payment_status, e.is_first_time, e.waiver_signed_at,
         s.session_name, s.day_of_week, s.start_time, s.session_start_date
    FROM public.swim_enrollments e
    LEFT JOIN public.swim_sessions s ON s.id = e.session_id
   WHERE e.waiver_token = _token
   LIMIT 1;
$$;

-- RPC: mark waiver signed
CREATE OR REPLACE FUNCTION public.mark_swim_enrollment_waiver_signed(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  UPDATE public.swim_enrollments
     SET waiver_signed_at = COALESCE(waiver_signed_at, now()),
         updated_at = now()
   WHERE waiver_token = _token
   RETURNING id INTO _id;

  IF _id IS NULL THEN
    RAISE EXCEPTION 'Invalid waiver token';
  END IF;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_swim_enrollment_by_waiver_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_swim_enrollment_waiver_signed(text) TO anon, authenticated;
