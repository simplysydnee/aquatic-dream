-- 1. lesson_bookings: waiver fields
ALTER TABLE public.lesson_bookings
  ADD COLUMN IF NOT EXISTS waiver_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS waiver_signed_at timestamptz;

-- Backfill tokens for existing rows so admin UI works
UPDATE public.lesson_bookings
   SET waiver_token = replace(gen_random_uuid()::text, '-', '')
 WHERE waiver_token IS NULL;

-- 2. enrollment_agreements: support lesson bookings too
ALTER TABLE public.enrollment_agreements
  ALTER COLUMN enrollment_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS lesson_booking_id uuid;

ALTER TABLE public.enrollment_agreements
  DROP CONSTRAINT IF EXISTS enrollment_agreements_target_check;

ALTER TABLE public.enrollment_agreements
  ADD CONSTRAINT enrollment_agreements_target_check
  CHECK (
    (enrollment_id IS NOT NULL AND lesson_booking_id IS NULL)
    OR (enrollment_id IS NULL AND lesson_booking_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_enrollment_agreements_lesson_booking
  ON public.enrollment_agreements(lesson_booking_id);

-- 3. Public lookup function (token -> minimal booking info)
CREATE OR REPLACE FUNCTION public.get_lesson_booking_by_waiver_token(_token text)
RETURNS TABLE (
  id uuid,
  parent_name text,
  parent_email text,
  child_name text,
  lesson_type text,
  waiver_signed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, parent_name, parent_email, child_name, lesson_type, waiver_signed_at
    FROM public.lesson_bookings
   WHERE waiver_token = _token
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_lesson_booking_by_waiver_token(text) TO anon, authenticated;

-- 4. Public mark-signed function (token-based, no auth required)
CREATE OR REPLACE FUNCTION public.mark_lesson_waiver_signed(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _booking_id uuid;
BEGIN
  UPDATE public.lesson_bookings
     SET waiver_signed_at = COALESCE(waiver_signed_at, now()),
         updated_at = now()
   WHERE waiver_token = _token
   RETURNING id INTO _booking_id;

  IF _booking_id IS NULL THEN
    RAISE EXCEPTION 'Invalid waiver token';
  END IF;

  RETURN _booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_lesson_waiver_signed(text) TO anon, authenticated;