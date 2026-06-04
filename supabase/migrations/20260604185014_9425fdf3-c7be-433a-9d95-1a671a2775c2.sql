CREATE POLICY "Admins delete resumes"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'resumes' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins update resumes"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'resumes' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'resumes' AND public.has_role(auth.uid(), 'admin'::public.app_role));