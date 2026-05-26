
-- 1. Instructors: hide hourly_wage from non-admins via column grants
REVOKE SELECT ON public.instructors FROM authenticated;
GRANT SELECT (id, name, email, phone, is_active, user_id, created_at, updated_at) ON public.instructors TO authenticated;

-- 2. Instructor availability: restrict broad read
DROP POLICY IF EXISTS "Authenticated view availability" ON public.instructor_availability;
CREATE POLICY "Owner or admin view availability"
ON public.instructor_availability
FOR SELECT
TO authenticated
USING (instructor_id = public.current_user_instructor_id() OR public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Resumes bucket: admins only
DROP POLICY IF EXISTS "Authenticated users can view resumes" ON storage.objects;
CREATE POLICY "Admins can view resumes"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'resumes' AND public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Suppressed emails: explicit admin read policy
CREATE POLICY "Admins view suppressed emails"
ON public.suppressed_emails
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
