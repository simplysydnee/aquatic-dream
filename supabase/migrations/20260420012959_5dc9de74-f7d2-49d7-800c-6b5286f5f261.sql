
-- 1. Schema additions
ALTER TABLE public.swim_enrollments
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS payment_reference text;

-- 2. Drop public INSERT policy (root cause of false paid rows)
DROP POLICY IF EXISTS "Anyone can submit swim enrollment" ON public.swim_enrollments;

-- 3. Service role can insert (used by payments-webhook + admin-create-enrollment)
DROP POLICY IF EXISTS "Service role can insert enrollments" ON public.swim_enrollments;
CREATE POLICY "Service role can insert enrollments"
  ON public.swim_enrollments
  FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role');

-- 4. Admins can insert manually (via UI through admin edge function in future, or directly)
DROP POLICY IF EXISTS "Admins can insert enrollments" ON public.swim_enrollments;
CREATE POLICY "Admins can insert enrollments"
  ON public.swim_enrollments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Pricing update
UPDATE public.swim_sessions
SET session_price = 240,
    price_per_lesson = 30,
    total_lessons = 8
WHERE is_active = true;

-- 6. Update default for future sessions
ALTER TABLE public.swim_sessions
  ALTER COLUMN session_price SET DEFAULT 240,
  ALTER COLUMN price_per_lesson SET DEFAULT 30;
