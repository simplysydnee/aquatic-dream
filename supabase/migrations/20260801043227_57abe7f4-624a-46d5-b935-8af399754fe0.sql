ALTER TABLE public.swim_enrollments ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.lesson_bookings ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMP WITH TIME ZONE;

UPDATE public.swim_enrollments SET admin_reviewed_at = now() WHERE admin_reviewed_at IS NULL;
UPDATE public.lesson_bookings SET admin_reviewed_at = now() WHERE admin_reviewed_at IS NULL;
