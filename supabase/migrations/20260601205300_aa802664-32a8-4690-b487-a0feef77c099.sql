ALTER TABLE public.instructor_booking_blocks
  ADD COLUMN IF NOT EXISTS break_start_time time,
  ADD COLUMN IF NOT EXISTS break_end_time time;

CREATE OR REPLACE FUNCTION public.validate_booking_block_break()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.break_start_time IS NULL) <> (NEW.break_end_time IS NULL) THEN
    RAISE EXCEPTION 'Break start and end must both be set or both null';
  END IF;
  IF NEW.break_start_time IS NOT NULL THEN
    IF NEW.break_end_time <= NEW.break_start_time THEN
      RAISE EXCEPTION 'Break end must be after break start';
    END IF;
    IF NEW.break_start_time < NEW.start_time OR NEW.break_end_time > NEW.end_time THEN
      RAISE EXCEPTION 'Break must fall within block start/end times';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_booking_block_break_trg ON public.instructor_booking_blocks;
CREATE TRIGGER validate_booking_block_break_trg
BEFORE INSERT OR UPDATE ON public.instructor_booking_blocks
FOR EACH ROW EXECUTE FUNCTION public.validate_booking_block_break();