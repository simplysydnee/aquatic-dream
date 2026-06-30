
CREATE OR REPLACE FUNCTION public.swimmer_has_waiver_on_file(_first text, _last text, _dob date, _parent_email text DEFAULT NULL::text, _parent_phone text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm_first text;
  norm_last  text;
  norm_email text;
  distinct_firsts text[];
BEGIN
  IF _first IS NULL THEN
    RETURN false;
  END IF;

  norm_first := lower(regexp_replace(trim(_first), '\s+', ' ', 'g'));
  norm_email := lower(trim(coalesce(_parent_email, '')));

  IF norm_first = '' THEN
    RETURN false;
  END IF;

  -- Primary path: last_name + dob bind across all three sources.
  IF _last IS NOT NULL AND _dob IS NOT NULL THEN
    norm_last := lower(regexp_replace(trim(_last), '\s+', ' ', 'g'));

    IF norm_last <> '' THEN
      WITH candidates AS (
        SELECT lower(regexp_replace(trim(coalesce(s->>'first_name','')), '\s+', ' ', 'g')) AS f
          FROM public.visitor_waivers w
          CROSS JOIN LATERAL jsonb_array_elements(coalesce(w.swimmers, '[]'::jsonb)) AS s
         WHERE w.signed_at >= now() - interval '1 year'
           AND lower(regexp_replace(trim(coalesce(s->>'last_name','')), '\s+', ' ', 'g')) = norm_last
           AND nullif(s->>'dob','')::date = _dob
        UNION
        SELECT lower(regexp_replace(trim(coalesce(e.child_first_name,'')), '\s+', ' ', 'g'))
          FROM public.enrollment_agreements a
          JOIN public.swim_enrollments e ON e.id = a.enrollment_id
         WHERE a.signed_at IS NOT NULL
           AND lower(regexp_replace(trim(coalesce(e.child_last_name,'')), '\s+', ' ', 'g')) = norm_last
           AND e.child_dob = _dob
        UNION
        SELECT lower(regexp_replace(trim(coalesce(b.child_first_name,'')), '\s+', ' ', 'g'))
          FROM public.lesson_bookings b
         WHERE b.waiver_signed_at IS NOT NULL
           AND lower(regexp_replace(trim(coalesce(b.child_last_name,'')), '\s+', ' ', 'g')) = norm_last
           AND b.child_dob = _dob
      )
      SELECT array_agg(DISTINCT f) FILTER (WHERE f <> '' AND f IS NOT NULL)
        INTO distinct_firsts
        FROM candidates;
    END IF;
  END IF;

  -- Fallback path: email-bound visitor waiver (covers enrollments missing dob/last_name).
  IF (distinct_firsts IS NULL OR array_length(distinct_firsts, 1) = 0)
     AND norm_email <> '' THEN
    WITH candidates AS (
      SELECT lower(regexp_replace(trim(coalesce(s->>'first_name','')), '\s+', ' ', 'g')) AS f
        FROM public.visitor_waivers w
        CROSS JOIN LATERAL jsonb_array_elements(coalesce(w.swimmers, '[]'::jsonb)) AS s
       WHERE w.signed_at >= now() - interval '1 year'
         AND lower(trim(coalesce(w.signer_email, ''))) = norm_email
    )
    SELECT array_agg(DISTINCT f) FILTER (WHERE f <> '' AND f IS NOT NULL)
      INTO distinct_firsts
      FROM candidates;
  END IF;

  IF distinct_firsts IS NULL OR array_length(distinct_firsts, 1) = 0 THEN
    RETURN false;
  END IF;

  IF array_length(distinct_firsts, 1) = 1 THEN
    RETURN EXISTS (
      SELECT 1 FROM unnest(distinct_firsts) AS c(f)
       WHERE c.f = norm_first
          OR c.f LIKE norm_first || '%'
          OR norm_first LIKE c.f || '%'
          OR levenshtein(c.f, norm_first) <= 2
    );
  ELSE
    RETURN norm_first = ANY(distinct_firsts);
  END IF;
END;
$function$;
