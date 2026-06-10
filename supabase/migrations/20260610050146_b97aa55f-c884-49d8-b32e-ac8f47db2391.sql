
-- 1. Universal waiver lookup for swim enrollments
CREATE OR REPLACE FUNCTION public.enrollments_waiver_status(_ids uuid[])
RETURNS TABLE(enrollment_id uuid, has_waiver boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id,
    (
      e.waiver_signed_at IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.enrollment_agreements a
         WHERE a.enrollment_id = e.id AND a.signed_at IS NOT NULL
      )
      OR (
        e.child_first_name IS NOT NULL AND e.child_last_name IS NOT NULL AND e.child_dob IS NOT NULL
        AND public.swimmer_has_waiver_on_file(e.child_first_name, e.child_last_name, e.child_dob)
      )
    ) AS has_waiver
  FROM public.swim_enrollments e
  WHERE e.id = ANY(_ids);
$$;

GRANT EXECUTE ON FUNCTION public.enrollments_waiver_status(uuid[]) TO authenticated, service_role;

-- 2. Universal waiver lookup for private lesson bookings
CREATE OR REPLACE FUNCTION public.bookings_waiver_status(_ids uuid[])
RETURNS TABLE(booking_id uuid, has_waiver boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id,
    (
      b.waiver_signed_at IS NOT NULL
      OR (
        b.child_first_name IS NOT NULL AND b.child_last_name IS NOT NULL AND b.child_dob IS NOT NULL
        AND public.swimmer_has_waiver_on_file(b.child_first_name, b.child_last_name, b.child_dob)
      )
    ) AS has_waiver
  FROM public.lesson_bookings b
  WHERE b.id = ANY(_ids);
$$;

GRANT EXECUTE ON FUNCTION public.bookings_waiver_status(uuid[]) TO authenticated, service_role;

-- 3. Check-in tracking on private lesson occurrences
ALTER TABLE public.lesson_booking_occurrences
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by text;
