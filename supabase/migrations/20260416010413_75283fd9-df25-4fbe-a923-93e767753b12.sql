-- Add partial unique index to prevent duplicate enrollments
CREATE UNIQUE INDEX idx_unique_active_enrollment 
ON public.swim_enrollments (session_id, child_name, parent_email) 
WHERE status IN ('confirmed', 'enrolled', 'pending');

-- Change default status to 'confirmed' to match what the app inserts
ALTER TABLE public.swim_enrollments ALTER COLUMN status SET DEFAULT 'confirmed';