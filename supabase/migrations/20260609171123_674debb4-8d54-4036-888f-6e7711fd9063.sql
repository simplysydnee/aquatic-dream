
-- 1. Link table connecting visitor waivers to enrolled swimmers / lesson bookings
CREATE TABLE IF NOT EXISTS public.visitor_waiver_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_waiver_id uuid NOT NULL REFERENCES public.visitor_waivers(id) ON DELETE CASCADE,
  enrollment_id uuid REFERENCES public.swim_enrollments(id) ON DELETE CASCADE,
  lesson_booking_id uuid REFERENCES public.lesson_bookings(id) ON DELETE CASCADE,
  swimmer_name text NOT NULL,
  matched_by text NOT NULL DEFAULT 'name',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((enrollment_id IS NOT NULL) <> (lesson_booking_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS visitor_waiver_links_enr_uq
  ON public.visitor_waiver_links (visitor_waiver_id, enrollment_id)
  WHERE enrollment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS visitor_waiver_links_lb_uq
  ON public.visitor_waiver_links (visitor_waiver_id, lesson_booking_id)
  WHERE lesson_booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS visitor_waiver_links_enr_idx
  ON public.visitor_waiver_links (enrollment_id);
CREATE INDEX IF NOT EXISTS visitor_waiver_links_lb_idx
  ON public.visitor_waiver_links (lesson_booking_id);

GRANT SELECT ON public.visitor_waiver_links TO authenticated;
GRANT ALL ON public.visitor_waiver_links TO service_role;

ALTER TABLE public.visitor_waiver_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view visitor waiver links"
  ON public.visitor_waiver_links FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Backfill function: match a visitor waiver's swimmers to enrollments + bookings
CREATE OR REPLACE FUNCTION public.link_visitor_waiver(_waiver_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _waiver public.visitor_waivers;
  _swimmer jsonb;
  _name text;
BEGIN
  SELECT * INTO _waiver FROM public.visitor_waivers WHERE id = _waiver_id;
  IF _waiver.id IS NULL THEN RETURN; END IF;

  FOR _swimmer IN SELECT * FROM jsonb_array_elements(COALESCE(_waiver.swimmers, '[]'::jsonb))
  LOOP
    _name := lower(trim(COALESCE(_swimmer->>'first_name','') || ' ' || COALESCE(_swimmer->>'last_name','')));
    IF _name = '' OR _name = ' ' THEN CONTINUE; END IF;

    -- Active swim enrollments
    INSERT INTO public.visitor_waiver_links (visitor_waiver_id, enrollment_id, swimmer_name, matched_by)
    SELECT _waiver.id, e.id, _name, 'name'
      FROM public.swim_enrollments e
     WHERE lower(trim(e.child_name)) = _name
       AND e.status IN ('confirmed','enrolled')
    ON CONFLICT DO NOTHING;

    UPDATE public.swim_enrollments e
       SET waiver_signed_at = COALESCE(e.waiver_signed_at, _waiver.signed_at),
           updated_at = now()
     WHERE lower(trim(e.child_name)) = _name
       AND e.status IN ('confirmed','enrolled')
       AND e.waiver_signed_at IS NULL;

    -- Lesson bookings (private lessons) — match active/upcoming series
    INSERT INTO public.visitor_waiver_links (visitor_waiver_id, lesson_booking_id, swimmer_name, matched_by)
    SELECT _waiver.id, b.id, _name, 'name'
      FROM public.lesson_bookings b
     WHERE lower(trim(b.child_name)) = _name
    ON CONFLICT DO NOTHING;

    UPDATE public.lesson_bookings b
       SET waiver_signed_at = COALESCE(b.waiver_signed_at, _waiver.signed_at),
           updated_at = now()
     WHERE lower(trim(b.child_name)) = _name
       AND b.waiver_signed_at IS NULL;
  END LOOP;
END;
$$;

-- 3. Trigger: auto-link on every new visitor_waivers insert
CREATE OR REPLACE FUNCTION public.tg_visitor_waiver_autolink()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.link_visitor_waiver(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visitor_waiver_autolink ON public.visitor_waivers;
CREATE TRIGGER visitor_waiver_autolink
  AFTER INSERT ON public.visitor_waivers
  FOR EACH ROW EXECUTE FUNCTION public.tg_visitor_waiver_autolink();

-- 4. One-time backfill for all existing visitor waivers
DO $$
DECLARE _id uuid;
BEGIN
  FOR _id IN SELECT id FROM public.visitor_waivers LOOP
    PERFORM public.link_visitor_waiver(_id);
  END LOOP;
END $$;

-- 5. Read-side helper for the admin Waivers page
CREATE OR REPLACE FUNCTION public.get_visitor_waiver_links()
RETURNS TABLE (
  visitor_waiver_id uuid,
  enrollment_id uuid,
  lesson_booking_id uuid,
  swimmer_name text,
  child_name text,
  parent_email text,
  link_kind text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.visitor_waiver_id, l.enrollment_id, l.lesson_booking_id, l.swimmer_name,
         COALESCE(e.child_name, b.child_name) AS child_name,
         COALESCE(e.parent_email, b.parent_email) AS parent_email,
         CASE WHEN l.enrollment_id IS NOT NULL THEN 'enrollment' ELSE 'lesson' END AS link_kind
    FROM public.visitor_waiver_links l
    LEFT JOIN public.swim_enrollments e ON e.id = l.enrollment_id
    LEFT JOIN public.lesson_bookings  b ON b.id = l.lesson_booking_id
   WHERE public.has_role(auth.uid(), 'admin'::app_role);
$$;
