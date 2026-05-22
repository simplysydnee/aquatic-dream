
-- ============================================================
-- swim_enrollments: remove public/over-permissive policies
-- ============================================================
DROP POLICY IF EXISTS "Public can view enrollment counts" ON public.swim_enrollments;
DROP POLICY IF EXISTS "Authenticated users can update enrollments" ON public.swim_enrollments;
DROP POLICY IF EXISTS "Authenticated users can view enrollments" ON public.swim_enrollments;

CREATE POLICY "Admins view all enrollments"
  ON public.swim_enrollments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins update enrollments"
  ON public.swim_enrollments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins delete enrollments"
  ON public.swim_enrollments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Service role updates enrollments"
  ON public.swim_enrollments FOR UPDATE TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Public aggregate-only RPC for capacity counts
CREATE OR REPLACE FUNCTION public.get_session_enrollment_counts(_session_ids uuid[])
RETURNS TABLE(session_id uuid, enrolled_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.session_id, COUNT(*)::int
    FROM public.swim_enrollments e
   WHERE e.session_id = ANY(_session_ids)
     AND e.status IN ('pending','confirmed','enrolled')
   GROUP BY e.session_id;
$$;
REVOKE ALL ON FUNCTION public.get_session_enrollment_counts(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_session_enrollment_counts(uuid[]) TO anon, authenticated;

-- ============================================================
-- attendance: remove anon write/read, keep instructor/admin
-- ============================================================
DROP POLICY IF EXISTS "Anyone can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Anyone can update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Anyone can view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated users can delete attendance" ON public.attendance;

CREATE POLICY "Admins manage attendance"
  ON public.attendance FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- instructors: restrict PII; admins write
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view instructors" ON public.instructors;
DROP POLICY IF EXISTS "Authenticated users can manage instructors" ON public.instructors;

CREATE POLICY "Authenticated view instructors"
  ON public.instructors FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage instructors"
  ON public.instructors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- contact_submissions: admin-only updates
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can update submissions" ON public.contact_submissions;
DROP POLICY IF EXISTS "Authenticated users can view submissions" ON public.contact_submissions;
CREATE POLICY "Admins view contact submissions"
  ON public.contact_submissions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update contact submissions"
  ON public.contact_submissions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- dive_bookings: admin-only updates
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can update dive bookings" ON public.dive_bookings;
DROP POLICY IF EXISTS "Authenticated users can view dive bookings" ON public.dive_bookings;
CREATE POLICY "Admins view dive bookings"
  ON public.dive_bookings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update dive bookings"
  ON public.dive_bookings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- lesson_requests: admin-only updates
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can update lesson requests" ON public.lesson_requests;
DROP POLICY IF EXISTS "Authenticated users can view lesson requests" ON public.lesson_requests;
CREATE POLICY "Admins view lesson requests"
  ON public.lesson_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update lesson requests"
  ON public.lesson_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- job_applications: admin-only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can update job applications" ON public.job_applications;
DROP POLICY IF EXISTS "Authenticated users can view job applications" ON public.job_applications;
CREATE POLICY "Admins view job applications"
  ON public.job_applications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update job applications"
  ON public.job_applications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- job_postings: admin manage
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage job postings" ON public.job_postings;
CREATE POLICY "Admins manage job postings"
  ON public.job_postings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- session_lesson_dates: admin manage
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage class dates" ON public.session_lesson_dates;
CREATE POLICY "Admins manage class dates"
  ON public.session_lesson_dates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- session_periods: admin manage
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage session periods" ON public.session_periods;
CREATE POLICY "Admins manage session periods"
  ON public.session_periods FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- swim_sessions: admin manage
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage sessions" ON public.swim_sessions;
CREATE POLICY "Admins manage swim sessions"
  ON public.swim_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- pool_events: hide from anon, admin manage
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view pool events" ON public.pool_events;
DROP POLICY IF EXISTS "Authenticated users can manage pool events" ON public.pool_events;
CREATE POLICY "Authenticated view pool events"
  ON public.pool_events FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Admins manage pool events"
  ON public.pool_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- Realtime: stop broadcasting PII-bearing tables
-- ============================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.lesson_bookings;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.marketing_contacts;
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- ============================================================
-- Function search_path fixes + revoke from public
-- ============================================================
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;

REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM public, anon, authenticated;
