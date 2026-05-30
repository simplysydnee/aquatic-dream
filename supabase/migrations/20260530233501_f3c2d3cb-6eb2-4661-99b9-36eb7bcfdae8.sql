GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitor_waivers TO authenticated;
GRANT INSERT ON public.visitor_waivers TO anon;
GRANT ALL ON public.visitor_waivers TO service_role;