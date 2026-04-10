ALTER TABLE public.job_applications
  ADD COLUMN is_viewed boolean NOT NULL DEFAULT false,
  ADD COLUMN is_archived boolean NOT NULL DEFAULT false;