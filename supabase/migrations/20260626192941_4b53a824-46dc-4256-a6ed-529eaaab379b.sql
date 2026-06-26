
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- Uniqueness-gated fuzzy waiver lookup.
-- Anchored by last_name + dob; optional parent_email/phone as cousin guard.
-- If exactly one distinct first name exists in the candidate pool, allow
-- fuzzy match (prefix or Levenshtein <= 2). Otherwise (twins/siblings),
-- require exact normalized first-name match.
CREATE OR REPLACE FUNCTION public.swimmer_has_waiver_on_file(
  _first text,
  _last text,
  _dob date,
  _parent_email text DEFAULT NULL,
  _parent_phone text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  norm_first text;
  norm_last  text;
  norm_email text;
  norm_phone text;
  distinct_firsts text[];
BEGIN
  IF _first IS NULL OR _last IS NULL OR _dob IS NULL THEN
    RETURN false;
  END IF;

  norm_first := lower(regexp_replace(trim(_first), '\s+', ' ', 'g'));
  norm_last  := lower(regexp_replace(trim(_last),  '\s+', ' ', 'g'));
  norm_email := nullif(lower(trim(coalesce(_parent_email, ''))), '');
  norm_phone := nullif(regexp_replace(coalesce(_parent_phone, ''), '\D', '', 'g'), '');

  WITH candidates AS (
    SELECT lower(regexp_replace(trim(coalesce(s->>'first_name','')), '\s+', ' ', 'g')) AS f
      FROM public.visitor_waivers w
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(w.swimmers, '[]'::jsonb)) AS s
     WHERE w.signed_at >= now() - interval '1 year'
       AND lower(regexp_replace(trim(coalesce(s->>'last_name','')), '\s+', ' ', 'g')) = norm_last
       AND nullif(s->>'dob','')::date = _dob
       AND (
         (norm_email IS NULL AND norm_phone IS NULL)
         OR (norm_email IS NOT NULL AND lower(trim(coalesce(w.signer_email,''))) = norm_email)
         OR (norm_phone IS NOT NULL AND regexp_replace(coalesce(w.signer_phone,''), '\D', '', 'g') = norm_phone)
       )
    UNION
    SELECT lower(regexp_replace(trim(coalesce(e.child_first_name,'')), '\s+', ' ', 'g'))
      FROM public.enrollment_agreements a
      JOIN public.swim_enrollments e ON e.id = a.enrollment_id
     WHERE a.signed_at IS NOT NULL
       AND lower(regexp_replace(trim(coalesce(e.child_last_name,'')), '\s+', ' ', 'g')) = norm_last
       AND e.child_dob = _dob
       AND (
         (norm_email IS NULL AND norm_phone IS NULL)
         OR (norm_email IS NOT NULL AND lower(trim(coalesce(e.parent_email,''))) = norm_email)
         OR (norm_phone IS NOT NULL AND regexp_replace(coalesce(e.parent_phone,''), '\D', '', 'g') = norm_phone)
       )
    UNION
    SELECT lower(regexp_replace(trim(coalesce(b.child_first_name,'')), '\s+', ' ', 'g'))
      FROM public.lesson_bookings b
     WHERE b.waiver_signed_at IS NOT NULL
       AND lower(regexp_replace(trim(coalesce(b.child_last_name,'')), '\s+', ' ', 'g')) = norm_last
       AND b.child_dob = _dob
       AND (
         (norm_email IS NULL AND norm_phone IS NULL)
         OR (norm_email IS NOT NULL AND lower(trim(coalesce(b.parent_email,''))) = norm_email)
         OR (norm_phone IS NOT NULL AND regexp_replace(coalesce(b.parent_phone,''), '\D', '', 'g') = norm_phone)
       )
  )
  SELECT array_agg(DISTINCT f) FILTER (WHERE f <> '' AND f IS NOT NULL)
    INTO distinct_firsts
    FROM candidates;

  IF distinct_firsts IS NULL OR array_length(distinct_firsts, 1) = 0 THEN
    RETURN false;
  END IF;

  IF array_length(distinct_firsts, 1) = 1 THEN
    -- Uniqueness gate satisfied: allow fuzzy match.
    RETURN EXISTS (
      SELECT 1 FROM unnest(distinct_firsts) AS c(f)
       WHERE c.f = norm_first
          OR c.f LIKE norm_first || '%'
          OR norm_first LIKE c.f || '%'
          OR levenshtein(c.f, norm_first) <= 2
    );
  ELSE
    -- Ambiguous pool (e.g., twins): exact match only.
    RETURN norm_first = ANY(distinct_firsts);
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.swimmer_has_waiver_on_file(text, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.swimmer_has_waiver_on_file(text, text, date, text, text) TO authenticated, service_role;

-- Update wrappers to pass parent_email + parent_phone through.
CREATE OR REPLACE FUNCTION public.enrollments_waiver_status(_ids uuid[])
RETURNS TABLE(enrollment_id uuid, has_waiver boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT e.id,
         public.swimmer_has_waiver_on_file(
           e.child_first_name, e.child_last_name, e.child_dob,
           e.parent_email, e.parent_phone
         )
    FROM public.swim_enrollments e
   WHERE e.id = ANY(_ids);
$function$;

GRANT EXECUTE ON FUNCTION public.enrollments_waiver_status(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bookings_waiver_status(_ids uuid[])
RETURNS TABLE(booking_id uuid, has_waiver boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT b.id,
         public.swimmer_has_waiver_on_file(
           b.child_first_name, b.child_last_name, b.child_dob,
           b.parent_email, b.parent_phone
         )
    FROM public.lesson_bookings b
   WHERE b.id = ANY(_ids);
$function$;

GRANT EXECUTE ON FUNCTION public.bookings_waiver_status(uuid[]) TO authenticated, service_role;
