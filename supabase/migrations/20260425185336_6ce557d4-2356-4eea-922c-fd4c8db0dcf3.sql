
-- 1. Link instructors to login accounts
ALTER TABLE public.instructors
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE;

-- 2. Helper: returns the instructor row id for the currently signed-in user
CREATE OR REPLACE FUNCTION public.current_user_instructor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.instructors WHERE user_id = auth.uid() LIMIT 1
$$;

-- 3. Shifts: instructors see their own + published shifts in the same week
DROP POLICY IF EXISTS "Instructors view team shifts" ON public.shifts;
CREATE POLICY "Instructors view team shifts"
  ON public.shifts FOR SELECT TO authenticated
  USING (
    instructor_id = current_user_instructor_id()
    OR (status = 'published' AND current_user_instructor_id() IS NOT NULL)
  );

-- 4. Schedule publications: any instructor can read
DROP POLICY IF EXISTS "Instructors view publications" ON public.schedule_publications;
CREATE POLICY "Instructors view publications"
  ON public.schedule_publications FOR SELECT TO authenticated
  USING (current_user_instructor_id() IS NOT NULL);

-- 5. Shift positions: instructors can read so colors/labels render
DROP POLICY IF EXISTS "Instructors view positions" ON public.shift_positions;
CREATE POLICY "Instructors view positions"
  ON public.shift_positions FOR SELECT TO authenticated
  USING (current_user_instructor_id() IS NOT NULL);

-- 6. Swim sessions are already public-readable; nothing to add.

-- 7. Session lesson dates already public-readable; nothing to add.

-- 8. Swim enrollments: instructors can view enrollments for classes they teach
--    (still excludes parent contact via column-level via the app; RLS allows row read)
DROP POLICY IF EXISTS "Instructors view their class roster" ON public.swim_enrollments;
CREATE POLICY "Instructors view their class roster"
  ON public.swim_enrollments FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT id FROM public.swim_sessions
      WHERE instructor_id = current_user_instructor_id()
    )
  );

-- 9. Attendance: instructors can read/write attendance for their classes
DROP POLICY IF EXISTS "Instructors manage their attendance" ON public.attendance;
CREATE POLICY "Instructors manage their attendance"
  ON public.attendance FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT id FROM public.swim_sessions
      WHERE instructor_id = current_user_instructor_id()
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM public.swim_sessions
      WHERE instructor_id = current_user_instructor_id()
    )
  );

-- 10. Profiles: let instructors view their own profile (already exists by user_id match — keep)
