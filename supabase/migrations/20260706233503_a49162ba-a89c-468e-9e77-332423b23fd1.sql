CREATE OR REPLACE FUNCTION public.get_session_gap_outreach(_from_period uuid, _to_period uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result jsonb;
  _capacity jsonb;
  _gap jsonb;
  _to_start date;
  _to_end date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT start_date, end_date INTO _to_start, _to_end
    FROM public.session_periods WHERE id = _to_period;

  -- Per-level capacity for the target (Session 2) period
  WITH sess AS (
    SELECT swim_level, max_students, id
      FROM public.swim_sessions
     WHERE session_period_id = _to_period AND is_active = true
  ),
  enr AS (
    SELECT s.swim_level, count(e.id) AS cnt
      FROM sess s
      LEFT JOIN public.swim_enrollments e
        ON e.session_id = s.id
       AND e.status IN ('confirmed','enrolled','pending_payment')
     GROUP BY s.swim_level
  ),
  cap AS (
    SELECT s.swim_level,
           sum(s.max_students) AS total_capacity,
           coalesce(max(e.cnt), 0) AS enrolled_count
      FROM sess s
      LEFT JOIN enr e ON e.swim_level = s.swim_level
     GROUP BY s.swim_level
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'swim_level', swim_level,
           'total_capacity', total_capacity,
           'enrolled', enrolled_count,
           'spots_left', greatest(total_capacity - enrolled_count, 0)
         ) ORDER BY swim_level), '[]'::jsonb)
    INTO _capacity FROM cap;

  -- Legacy-safe derivation for enrollments (mirrors enrollments_waiver_status)
  WITH e_derived AS (
    SELECT
      e.id,
      e.parent_name,
      e.parent_first_name,
      e.parent_last_name,
      e.parent_email,
      e.parent_phone,
      e.child_dob,
      e.swim_level,
      e.session_id,
      e.status,
      e.created_at,
      s.session_period_id,
      COALESCE(
        NULLIF(trim(e.child_first_name), ''),
        NULLIF(split_part(coalesce(e.child_name,''), ' ', 1), '')
      ) AS d_first,
      COALESCE(
        NULLIF(trim(e.child_last_name), ''),
        CASE WHEN position(' ' in coalesce(e.child_name,'')) > 0
             THEN NULLIF(trim(regexp_replace(e.child_name, '^.* ', '')), '') END,
        CASE WHEN position(' ' in coalesce(e.child_first_name,'')) > 0
             THEN NULLIF(trim(regexp_replace(e.child_first_name, ' [^ ]+$', '')), '') END
      ) AS d_last
      FROM public.swim_enrollments e
      LEFT JOIN public.swim_sessions s ON s.id = e.session_id
     WHERE e.status IN ('confirmed','enrolled','pending_payment')
  ),
  s1 AS (
    SELECT DISTINCT ON (lower(coalesce(d_first,'')), lower(coalesce(d_last,'')), coalesce(child_dob::text, lower(coalesce(parent_email,''))))
      id, parent_name, parent_email, parent_phone,
      d_first, d_last, child_dob, swim_level, created_at
      FROM e_derived
     WHERE session_period_id = _from_period
     ORDER BY lower(coalesce(d_first,'')), lower(coalesce(d_last,'')), coalesce(child_dob::text, lower(coalesce(parent_email,''))), created_at DESC
  ),
  s2_keys AS (
    SELECT DISTINCT
      lower(coalesce(d_first,'')) AS f,
      lower(coalesce(d_last,'')) AS l,
      child_dob AS dob,
      lower(coalesce(parent_email,'')) AS pe
      FROM e_derived
     WHERE session_period_id = _to_period
  ),
  s1_gap AS (
    SELECT s1.*
      FROM s1
     WHERE NOT EXISTS (
       SELECT 1 FROM s2_keys k
        WHERE (
          k.f = lower(coalesce(s1.d_first,''))
          AND k.l = lower(coalesce(s1.d_last,''))
          AND (
            (k.dob IS NOT NULL AND s1.child_dob IS NOT NULL AND k.dob = s1.child_dob)
            OR (s1.child_dob IS NULL AND k.pe = lower(coalesce(s1.parent_email,'')))
          )
        )
     )
  ),
  s1_gap_out AS (
    SELECT
      d_first || CASE WHEN d_last IS NOT NULL AND d_last <> '' THEN ' ' || d_last ELSE '' END AS child_name,
      d_first,
      swim_level AS last_level,
      parent_name,
      parent_email,
      parent_phone,
      'session_1'::text AS source,
      created_at
      FROM s1_gap
  ),
  -- Lesson requests in last 90 days without matching Session 2 enrollment
  lr AS (
    SELECT
      lr.id,
      lr.parent_name,
      lr.parent_email,
      lr.parent_phone,
      lr.child_name,
      lr.swim_level,
      lr.created_at,
      lower(split_part(coalesce(lr.child_name,''), ' ', 1)) AS f,
      CASE WHEN position(' ' in coalesce(lr.child_name,'')) > 0
           THEN lower(trim(regexp_replace(lr.child_name, '^.* ', ''))) END AS l
      FROM public.lesson_requests lr
     WHERE lr.created_at >= now() - interval '90 days'
  ),
  lr_gap AS (
    SELECT lr.*
      FROM lr
     WHERE NOT EXISTS (
       SELECT 1 FROM s2_keys k
        WHERE k.f = lr.f
          AND (lr.l IS NULL OR k.l = lr.l OR k.l = '')
          AND k.pe = lower(coalesce(lr.parent_email,''))
     )
  ),
  lr_gap_out AS (
    SELECT
      child_name,
      f AS d_first,
      swim_level AS last_level,
      parent_name,
      parent_email,
      parent_phone,
      'lesson_request'::text AS source,
      created_at
      FROM lr_gap
  ),
  combined AS (
    SELECT * FROM s1_gap_out
    UNION ALL
    SELECT * FROM lr_gap_out
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'child_name', child_name,
           'child_first', d_first,
           'last_level', last_level,
           'parent_name', parent_name,
           'parent_email', parent_email,
           'parent_phone', parent_phone,
           'source', source,
           'created_at', created_at
         ) ORDER BY created_at DESC), '[]'::jsonb)
    INTO _gap FROM combined;

  _result := jsonb_build_object(
    'to_period_start', _to_start,
    'to_period_end', _to_end,
    'capacity', _capacity,
    'gap', _gap
  );

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_session_gap_outreach(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_gap_outreach(uuid, uuid) TO authenticated;