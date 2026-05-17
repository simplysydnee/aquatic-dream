ALTER TABLE public.swim_enrollments REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.swim_enrollments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;