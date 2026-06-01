CREATE OR REPLACE FUNCTION public.get_active_waiver_for_swimmer(_first text, _last text, _dob date)
RETURNS TABLE(
  waiver_id uuid,
  signed_at timestamptz,
  signer_first_name text,
  signer_last_name text,
  signer_email text,
  signature_text text,
  photo_release_accepted boolean,
  emergency_contact_first_name text,
  emergency_contact_last_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.id, w.signed_at, w.signer_first_name, w.signer_last_name, w.signer_email,
         w.signature_text, w.photo_release_accepted,
         w.emergency_contact_first_name, w.emergency_contact_last_name,
         w.emergency_contact_phone, w.emergency_contact_relationship
    FROM public.visitor_waivers w
   CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.swimmers, '[]'::jsonb)) AS s
   WHERE w.signed_at >= now() - interval '1 year'
     AND lower(trim(COALESCE(s->>'first_name',''))) = lower(trim(_first))
     AND lower(trim(COALESCE(s->>'last_name',''))) = lower(trim(_last))
     AND NULLIF(s->>'dob','')::date = _dob
   ORDER BY w.signed_at DESC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_waiver_for_swimmer(text, text, date) TO anon, authenticated;