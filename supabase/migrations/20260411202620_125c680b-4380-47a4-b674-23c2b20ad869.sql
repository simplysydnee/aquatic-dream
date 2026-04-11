CREATE POLICY "Public can view enrollment counts"
ON public.swim_enrollments
FOR SELECT
TO anon
USING (true);