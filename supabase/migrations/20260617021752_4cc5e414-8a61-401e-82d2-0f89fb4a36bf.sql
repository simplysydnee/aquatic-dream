CREATE OR REPLACE FUNCTION public.get_public_taken_occurrences(p_from_date date, p_to_date date)
RETURNS TABLE(instructor_id uuid, occurrence_date date, start_time time, end_time time)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(o.instructor_override_id, b.instructor_id) AS instructor_id,
    o.occurrence_date,
    COALESCE(o.start_time_override, b.start_time) AS start_time,
    COALESCE(o.end_time_override, b.end_time) AS end_time
  FROM public.lesson_booking_occurrences o
  JOIN public.lesson_bookings b ON b.id = o.booking_id
  WHERE o.occurrence_date BETWEEN p_from_date AND p_to_date
    AND o.status <> 'cancelled'
    AND NOT (o.status = 'pending_card' AND o.created_at < now() - interval '30 minutes')
    AND COALESCE(o.instructor_override_id, b.instructor_id) IS NOT NULL
    AND COALESCE(o.start_time_override, b.start_time) IS NOT NULL
    AND COALESCE(o.end_time_override, b.end_time) IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_taken_occurrences(date, date) TO anon, authenticated;