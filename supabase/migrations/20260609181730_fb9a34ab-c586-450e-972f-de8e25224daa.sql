
ALTER TABLE public.lesson_bookings
  ADD COLUMN IF NOT EXISTS child_dob date;

CREATE OR REPLACE FUNCTION public.swimmer_has_waiver_on_file(
  _first text, _last text, _dob date
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    _first IS NOT NULL AND _last IS NOT NULL AND _dob IS NOT NULL
    AND (
      -- Visitor waivers (jsonb swimmers array)
      EXISTS (
        SELECT 1
          FROM public.visitor_waivers w
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.swimmers, '[]'::jsonb)) AS s
         WHERE w.signed_at >= now() - interval '1 year'
           AND lower(trim(COALESCE(s->>'first_name',''))) = lower(trim(_first))
           AND lower(trim(COALESCE(s->>'last_name','')))  = lower(trim(_last))
           AND NULLIF(s->>'dob','')::date = _dob
      )
      OR
      -- Enrollment agreements joined to the enrollment for child name + dob
      EXISTS (
        SELECT 1
          FROM public.enrollment_agreements a
          JOIN public.swim_enrollments e ON e.id = a.enrollment_id
         WHERE a.signed_at IS NOT NULL
           AND lower(trim(COALESCE(e.child_first_name,''))) = lower(trim(_first))
           AND lower(trim(COALESCE(e.child_last_name,'')))  = lower(trim(_last))
           AND e.child_dob = _dob
      )
      OR
      -- Prior lesson bookings already signed for this swimmer
      EXISTS (
        SELECT 1
          FROM public.lesson_bookings b
         WHERE b.waiver_signed_at IS NOT NULL
           AND lower(trim(COALESCE(b.child_first_name,''))) = lower(trim(_first))
           AND lower(trim(COALESCE(b.child_last_name,'')))  = lower(trim(_last))
           AND b.child_dob = _dob
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_active_waiver_signed_at_for_swimmer(
  _first text, _last text, _dob date
) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT max(ts) FROM (
    SELECT w.signed_at AS ts
      FROM public.visitor_waivers w
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.swimmers, '[]'::jsonb)) AS s
     WHERE w.signed_at >= now() - interval '1 year'
       AND lower(trim(COALESCE(s->>'first_name',''))) = lower(trim(_first))
       AND lower(trim(COALESCE(s->>'last_name','')))  = lower(trim(_last))
       AND NULLIF(s->>'dob','')::date = _dob
    UNION ALL
    SELECT a.signed_at
      FROM public.enrollment_agreements a
      JOIN public.swim_enrollments e ON e.id = a.enrollment_id
     WHERE a.signed_at IS NOT NULL
       AND lower(trim(COALESCE(e.child_first_name,''))) = lower(trim(_first))
       AND lower(trim(COALESCE(e.child_last_name,'')))  = lower(trim(_last))
       AND e.child_dob = _dob
    UNION ALL
    SELECT b.waiver_signed_at
      FROM public.lesson_bookings b
     WHERE b.waiver_signed_at IS NOT NULL
       AND lower(trim(COALESCE(b.child_first_name,''))) = lower(trim(_first))
       AND lower(trim(COALESCE(b.child_last_name,'')))  = lower(trim(_last))
       AND b.child_dob = _dob
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.swimmer_has_waiver_on_file(text, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_active_waiver_signed_at_for_swimmer(text, text, date) TO authenticated, service_role;
