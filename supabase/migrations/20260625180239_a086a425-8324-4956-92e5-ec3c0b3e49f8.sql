CREATE OR REPLACE FUNCTION public.get_returning_family_by_email(_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Most recent parent contact block
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

  -- Most recent emergency contact from any enrollment_agreement linked to this parent's enrollments
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

  -- Distinct swimmers ever enrolled under this email
  SELECT COALESCE(jsonb_agg(s ORDER BY s->>'last_enrolled_at' DESC), '[]'::jsonb)
    INTO _swimmers
    FROM (
      SELECT jsonb_build_object(
               'first_name', COALESCE(e.child_first_name, split_part(e.child_name, ' ', 1)),
               'last_name',  COALESCE(e.child_last_name,  NULLIF(substring(e.child_name from position(' ' in e.child_name) + 1), '')),
               'dob',        e.child_dob,
               'last_level', (array_agg(e.swim_level ORDER BY e.created_at DESC))[1],
               'last_enrolled_at', max(e.created_at)
             ) AS s
        FROM public.swim_enrollments e
       WHERE lower(e.parent_email) = _norm
         AND e.status IN ('confirmed','enrolled','pending_payment')
       GROUP BY
         lower(regexp_replace(trim(COALESCE(e.child_first_name, split_part(e.child_name, ' ', 1), '')), '\s+', ' ', 'g')),
         lower(regexp_replace(trim(COALESCE(e.child_last_name,  NULLIF(substring(e.child_name from position(' ' in e.child_name) + 1), ''), '')), '\s+', ' ', 'g')),
         e.child_dob
    ) t;

  RETURN jsonb_build_object(
    'parent',    _parent,
    'emergency', _emergency,
    'swimmers',  COALESCE(_swimmers, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_returning_family_by_email(text) TO anon, authenticated;