CREATE OR REPLACE FUNCTION public.swimmer_has_waiver_on_file(_first text, _last text, _dob date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _first IS NOT NULL AND _last IS NOT NULL AND _dob IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
          FROM public.visitor_waivers w
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.swimmers, '[]'::jsonb)) AS s
         WHERE w.signed_at >= now() - interval '1 year'
           AND lower(regexp_replace(trim(COALESCE(s->>'first_name','')), '\s+', ' ', 'g')) = lower(regexp_replace(trim(_first), '\s+', ' ', 'g'))
           AND lower(regexp_replace(trim(COALESCE(s->>'last_name','')),  '\s+', ' ', 'g')) = lower(regexp_replace(trim(_last),  '\s+', ' ', 'g'))
           AND NULLIF(s->>'dob','')::date = _dob
      )
      OR
      EXISTS (
        SELECT 1
          FROM public.enrollment_agreements a
          JOIN public.swim_enrollments e ON e.id = a.enrollment_id
         WHERE a.signed_at IS NOT NULL
           AND lower(regexp_replace(trim(COALESCE(e.child_first_name,'')), '\s+', ' ', 'g')) = lower(regexp_replace(trim(_first), '\s+', ' ', 'g'))
           AND lower(regexp_replace(trim(COALESCE(e.child_last_name,'')),  '\s+', ' ', 'g')) = lower(regexp_replace(trim(_last),  '\s+', ' ', 'g'))
           AND e.child_dob = _dob
      )
      OR
      EXISTS (
        SELECT 1
          FROM public.lesson_bookings b
         WHERE b.waiver_signed_at IS NOT NULL
           AND lower(regexp_replace(trim(COALESCE(b.child_first_name,'')), '\s+', ' ', 'g')) = lower(regexp_replace(trim(_first), '\s+', ' ', 'g'))
           AND lower(regexp_replace(trim(COALESCE(b.child_last_name,'')),  '\s+', ' ', 'g')) = lower(regexp_replace(trim(_last),  '\s+', ' ', 'g'))
           AND b.child_dob = _dob
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.link_visitor_waiver(_waiver_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _waiver public.visitor_waivers;
  _swimmer jsonb;
  _name text;
BEGIN
  SELECT * INTO _waiver FROM public.visitor_waivers WHERE id = _waiver_id;
  IF _waiver.id IS NULL THEN RETURN; END IF;

  FOR _swimmer IN SELECT * FROM jsonb_array_elements(COALESCE(_waiver.swimmers, '[]'::jsonb))
  LOOP
    _name := lower(regexp_replace(trim(COALESCE(_swimmer->>'first_name','') || ' ' || COALESCE(_swimmer->>'last_name','')), '\s+', ' ', 'g'));
    IF _name = '' OR _name = ' ' THEN CONTINUE; END IF;

    INSERT INTO public.visitor_waiver_links (visitor_waiver_id, enrollment_id, swimmer_name, matched_by)
    SELECT _waiver.id, e.id, _name, 'name'
      FROM public.swim_enrollments e
     WHERE lower(regexp_replace(trim(COALESCE(e.child_name,'')), '\s+', ' ', 'g')) = _name
       AND e.status IN ('confirmed','enrolled')
    ON CONFLICT DO NOTHING;

    UPDATE public.swim_enrollments e
       SET waiver_signed_at = COALESCE(e.waiver_signed_at, _waiver.signed_at),
           updated_at = now()
     WHERE lower(regexp_replace(trim(COALESCE(e.child_name,'')), '\s+', ' ', 'g')) = _name
       AND e.status IN ('confirmed','enrolled')
       AND e.waiver_signed_at IS NULL;

    INSERT INTO public.visitor_waiver_links (visitor_waiver_id, lesson_booking_id, swimmer_name, matched_by)
    SELECT _waiver.id, b.id, _name, 'name'
      FROM public.lesson_bookings b
     WHERE lower(regexp_replace(trim(COALESCE(b.child_name,'')), '\s+', ' ', 'g')) = _name
    ON CONFLICT DO NOTHING;

    UPDATE public.lesson_bookings b
       SET waiver_signed_at = COALESCE(b.waiver_signed_at, _waiver.signed_at),
           updated_at = now()
     WHERE lower(regexp_replace(trim(COALESCE(b.child_name,'')), '\s+', ' ', 'g')) = _name
       AND b.waiver_signed_at IS NULL;
  END LOOP;
END;
$function$;