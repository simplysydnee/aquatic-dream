CREATE OR REPLACE FUNCTION public.swimmer_has_active_waiver(_first text, _last text, _dob date)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.visitor_waivers w
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.swimmers, '[]'::jsonb)) AS s
     WHERE w.signed_at >= now() - interval '1 year'
       AND lower(trim(COALESCE(s->>'first_name',''))) = lower(trim(_first))
       AND lower(trim(COALESCE(s->>'last_name',''))) = lower(trim(_last))
       AND NULLIF(s->>'dob','')::date = _dob
  );
$$;

GRANT EXECUTE ON FUNCTION public.swimmer_has_active_waiver(text, text, date) TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_visitor_waivers_swimmers_gin
  ON public.visitor_waivers USING GIN (swimmers);
CREATE INDEX IF NOT EXISTS idx_visitor_waivers_signed_at
  ON public.visitor_waivers (signed_at DESC);