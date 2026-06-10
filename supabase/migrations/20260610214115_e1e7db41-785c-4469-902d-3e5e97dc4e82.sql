
-- Allow admins to manage visitor_waiver_links (insert/delete) so they can manually link
CREATE POLICY "Admins manage visitor waiver links"
  ON public.visitor_waiver_links
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitor_waiver_links TO authenticated;
GRANT ALL ON public.visitor_waiver_links TO service_role;

-- Search enrollments + lesson bookings by child name / parent email
CREATE OR REPLACE FUNCTION public.admin_search_link_targets(_q text)
RETURNS TABLE(
  kind text,
  target_id uuid,
  child_name text,
  parent_name text,
  parent_email text,
  detail text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  qq text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  qq := '%' || lower(trim(coalesce(_q,''))) || '%';
  IF length(qq) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT 'enrollment'::text,
           e.id,
           e.child_name,
           e.parent_name,
           e.parent_email,
           (coalesce(e.swim_level,'') || ' • ' || coalesce(e.status,''))::text
      FROM public.swim_enrollments e
     WHERE lower(coalesce(e.child_name,'')) LIKE qq
        OR lower(coalesce(e.parent_email,'')) LIKE qq
        OR lower(coalesce(e.parent_name,'')) LIKE qq
     ORDER BY e.created_at DESC
     LIMIT 25;

  RETURN QUERY
    SELECT 'lesson'::text,
           b.id,
           b.child_name,
           b.parent_name,
           b.parent_email,
           (coalesce(b.lesson_type,'private') || ' • ' || coalesce(b.instructor_name,''))::text
      FROM public.lesson_bookings b
     WHERE lower(coalesce(b.child_name,'')) LIKE qq
        OR lower(coalesce(b.parent_email,'')) LIKE qq
        OR lower(coalesce(b.parent_name,'')) LIKE qq
     ORDER BY b.created_at DESC
     LIMIT 25;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_search_link_targets(text) TO authenticated;

-- Manually link a visitor waiver to either an enrollment or a lesson booking
CREATE OR REPLACE FUNCTION public.admin_link_visitor_waiver(
  _waiver_id uuid,
  _enrollment_id uuid DEFAULT NULL,
  _lesson_booking_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _waiver public.visitor_waivers;
  _name text;
  _link_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF (_enrollment_id IS NULL) = (_lesson_booking_id IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of enrollment_id or lesson_booking_id';
  END IF;

  SELECT * INTO _waiver FROM public.visitor_waivers WHERE id = _waiver_id;
  IF _waiver.id IS NULL THEN RAISE EXCEPTION 'Waiver not found'; END IF;

  IF _enrollment_id IS NOT NULL THEN
    SELECT lower(trim(coalesce(child_name,''))) INTO _name FROM public.swim_enrollments WHERE id = _enrollment_id;
  ELSE
    SELECT lower(trim(coalesce(child_name,''))) INTO _name FROM public.lesson_bookings WHERE id = _lesson_booking_id;
  END IF;

  INSERT INTO public.visitor_waiver_links (visitor_waiver_id, enrollment_id, lesson_booking_id, swimmer_name, matched_by)
  VALUES (_waiver_id, _enrollment_id, _lesson_booking_id, coalesce(_name,''), 'manual')
  ON CONFLICT DO NOTHING
  RETURNING id INTO _link_id;

  -- Stamp waiver_signed_at on the linked record if it isn't set
  IF _enrollment_id IS NOT NULL THEN
    UPDATE public.swim_enrollments
       SET waiver_signed_at = COALESCE(waiver_signed_at, _waiver.signed_at, now()),
           updated_at = now()
     WHERE id = _enrollment_id;
  ELSE
    UPDATE public.lesson_bookings
       SET waiver_signed_at = COALESCE(waiver_signed_at, _waiver.signed_at, now()),
           updated_at = now()
     WHERE id = _lesson_booking_id;
  END IF;

  RETURN _link_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_link_visitor_waiver(uuid, uuid, uuid) TO authenticated;

-- Remove a manual or auto link
CREATE OR REPLACE FUNCTION public.admin_unlink_visitor_waiver(
  _waiver_id uuid,
  _enrollment_id uuid DEFAULT NULL,
  _lesson_booking_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  DELETE FROM public.visitor_waiver_links
   WHERE visitor_waiver_id = _waiver_id
     AND (_enrollment_id IS NULL OR enrollment_id = _enrollment_id)
     AND (_lesson_booking_id IS NULL OR lesson_booking_id = _lesson_booking_id);

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unlink_visitor_waiver(uuid, uuid, uuid) TO authenticated;
