
CREATE OR REPLACE FUNCTION public.get_returning_family_by_email(_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _norm text;
  _parent jsonb;
  _emergency jsonb;
  _swimmers jsonb;
BEGIN
  IF _email IS NULL OR length(trim(_email)) < 3 THEN
    RETURN jsonb_build_object('parent', NULL, 'emergency', NULL, 'swimmers', '[]'::jsonb);
  END IF;
  _norm := lower(trim(_email));

  SELECT jsonb_build_object(
           'first_name', COALESCE(e.parent_first_name, split_part(e.parent_name, ' ', 1)),
           'last_name',  COALESCE(e.parent_last_name,  NULLIF(substring(e.parent_name from position(' ' in e.parent_name) + 1), '')),
           'phone',      e.parent_phone
         )
    INTO _parent
    FROM public.swim_enrollments e
   WHERE lower(e.parent_email) = _norm
     AND e.status IN ('confirmed','enrolled','pending_payment')
   ORDER BY e.created_at DESC
   LIMIT 1;

  SELECT jsonb_build_object(
           'first_name',   a.emergency_contact_first_name,
           'last_name',    a.emergency_contact_last_name,
           'phone',        a.emergency_contact_phone,
           'relationship', a.emergency_contact_relationship
         )
    INTO _emergency
    FROM public.enrollment_agreements a
    JOIN public.swim_enrollments e ON e.id = a.enrollment_id
   WHERE lower(e.parent_email) = _norm
     AND a.signed_at IS NOT NULL
     AND COALESCE(a.emergency_contact_first_name, '') <> ''
   ORDER BY a.signed_at DESC
   LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'first_name', g.first_name,
           'last_name',  g.last_name,
           'dob',        g.dob,
           'last_level', g.last_level,
           'last_enrolled_at', g.last_enrolled_at
         ) ORDER BY g.last_enrolled_at DESC), '[]'::jsonb)
    INTO _swimmers
    FROM (
      SELECT
        COALESCE(e.child_first_name, split_part(e.child_name, ' ', 1)) AS first_name,
        COALESCE(e.child_last_name,  NULLIF(substring(e.child_name from position(' ' in e.child_name) + 1), '')) AS last_name,
        e.child_dob AS dob,
        (array_agg(e.swim_level ORDER BY e.created_at DESC))[1] AS last_level,
        max(e.created_at) AS last_enrolled_at
      FROM public.swim_enrollments e
      WHERE lower(e.parent_email) = _norm
        AND e.status IN ('confirmed','enrolled','pending_payment')
      GROUP BY
        COALESCE(e.child_first_name, split_part(e.child_name, ' ', 1)),
        COALESCE(e.child_last_name,  NULLIF(substring(e.child_name from position(' ' in e.child_name) + 1), '')),
        e.child_dob
    ) g;

  RETURN jsonb_build_object(
    'parent',    _parent,
    'emergency', _emergency,
    'swimmers',  COALESCE(_swimmers, '[]'::jsonb)
  );
END;
$function$;
