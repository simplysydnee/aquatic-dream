ALTER TABLE public.instructor_booking_blocks
  ADD COLUMN IF NOT EXISTS default_lesson_type text NOT NULL DEFAULT 'private';

ALTER TABLE public.instructor_booking_blocks
  DROP CONSTRAINT IF EXISTS instructor_booking_blocks_default_lesson_type_check;

ALTER TABLE public.instructor_booking_blocks
  ADD CONSTRAINT instructor_booking_blocks_default_lesson_type_check
  CHECK (default_lesson_type IN ('private','semi_private'));