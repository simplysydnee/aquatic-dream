
-- 1) Loosen email/phone gate: name+dob alone is enough; keep uniqueness-gated fuzzy first-name match.
CREATE OR REPLACE FUNCTION public.swimmer_has_waiver_on_file(_first text, _last text, _dob date, _parent_email text DEFAULT NULL::text, _parent_phone text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  norm_first text;
  norm_last  text;
  distinct_firsts text[];
BEGIN
  IF _first IS NULL OR _last IS NULL OR _dob IS NULL THEN
    RETURN false;
  END IF;

  norm_first := lower(regexp_replace(trim(_first), '\s+', ' ', 'g'));
  norm_last  := lower(regexp_replace(trim(_last),  '\s+', ' ', 'g'));

  IF norm_first = '' OR norm_last = '' THEN
    RETURN false;
  END IF;

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

-- 2) Make enrollments_waiver_status resilient to legacy/malformed name columns.
CREATE OR REPLACE FUNCTION public.enrollments_waiver_status(_ids uuid[])
 RETURNS TABLE(enrollment_id uuid, has_waiver boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH derived AS (
    SELECT
      e.id,
      e.child_dob,
      e.parent_email,
      e.parent_phone,
      -- last name: prefer split column; else last token of child_name;
      -- else last token of child_first_name (handles "Casey Turk" stuffed in first_name).
      COALESCE(
        NULLIF(trim(e.child_last_name), ''),
        CASE WHEN position(' ' in coalesce(e.child_name,'')) > 0
             THEN NULLIF(trim(regexp_replace(e.child_name, '^.* ', '')), '') END,
        CASE WHEN position(' ' in coalesce(e.child_first_name,'')) > 0
             THEN NULLIF(trim(regexp_replace(e.child_first_name, '^.* ', '')), '') END
      ) AS last_name,
      -- first name: if split first_name has a space and last_name was NULL, drop the trailing token;
      -- otherwise use split first_name; otherwise first token of child_name.
      COALESCE(
        CASE
          WHEN NULLIF(trim(e.child_last_name), '') IS NULL
               AND position(' ' in coalesce(e.child_first_name,'')) > 0
          THEN NULLIF(trim(regexp_replace(e.child_first_name, ' [^ ]+$', '')), '')
          ELSE NULLIF(trim(e.child_first_name), '')
        END,
        NULLIF(split_part(coalesce(e.child_name,''), ' ', 1), '')
      ) AS first_name
    FROM public.swim_enrollments e
    WHERE e.id = ANY(_ids)
  )
  SELECT d.id,
         public.swimmer_has_waiver_on_file(d.first_name, d.last_name, d.child_dob, d.parent_email, d.parent_phone)
    FROM derived d;
$function$;

-- 3) Same treatment for bookings_waiver_status.
CREATE OR REPLACE FUNCTION public.bookings_waiver_status(_ids uuid[])
 RETURNS TABLE(booking_id uuid, has_waiver boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH derived AS (
    SELECT
      b.id,
      b.child_dob,
      b.parent_email,
      b.parent_phone,
      COALESCE(
        NULLIF(trim(b.child_last_name), ''),
        CASE WHEN position(' ' in coalesce(b.child_name,'')) > 0
             THEN NULLIF(trim(regexp_replace(b.child_name, '^.* ', '')), '') END,
        CASE WHEN position(' ' in coalesce(b.child_first_name,'')) > 0
             THEN NULLIF(trim(regexp_replace(b.child_first_name, '^.* ', '')), '') END
      ) AS last_name,
      COALESCE(
        CASE
          WHEN NULLIF(trim(b.child_last_name), '') IS NULL
               AND position(' ' in coalesce(b.child_first_name,'')) > 0
          THEN NULLIF(trim(regexp_replace(b.child_first_name, ' [^ ]+$', '')), '')
          ELSE NULLIF(trim(b.child_first_name), '')
        END,
        NULLIF(split_part(coalesce(b.child_name,''), ' ', 1), '')
      ) AS first_name
    FROM public.lesson_bookings b
    WHERE b.id = ANY(_ids)
  )
  SELECT d.id,
         public.swimmer_has_waiver_on_file(d.first_name, d.last_name, d.child_dob, d.parent_email, d.parent_phone)
    FROM derived d;
$function$;
