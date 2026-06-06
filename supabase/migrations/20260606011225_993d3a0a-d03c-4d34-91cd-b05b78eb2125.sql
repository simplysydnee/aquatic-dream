
CREATE OR REPLACE FUNCTION public.enforce_slot_hold_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NEW.session_token IS NULL OR length(NEW.session_token) < 16 THEN
    RAISE EXCEPTION 'Invalid session token';
  END IF;

  IF NEW.held_until IS NULL OR NEW.held_until > now() + interval '30 minutes' THEN
    NEW.held_until := now() + interval '15 minutes';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.slot_holds
   WHERE session_token = NEW.session_token
     AND held_until > now();

  IF v_count >= 20 THEN
    RAISE EXCEPTION 'Too many active slot holds for this session';
  END IF;

  -- Must correspond to a real instructor booking block on that day-of-week / date range
  IF NOT EXISTS (
    SELECT 1 FROM public.instructor_booking_blocks b
     WHERE b.instructor_id = NEW.instructor_id
       AND b.is_blackout = false
       AND NEW.start_time >= b.start_time
       AND NEW.end_time <= b.end_time
       AND (
         (b.kind = 'weekly' AND b.day_of_week = EXTRACT(DOW FROM NEW.slot_date)::int
            AND (b.start_date IS NULL OR NEW.slot_date >= b.start_date)
            AND (b.end_date   IS NULL OR NEW.slot_date <= b.end_date))
         OR
         (b.kind = 'date_range'
            AND (b.start_date IS NULL OR NEW.slot_date >= b.start_date)
            AND (b.end_date   IS NULL OR NEW.slot_date <= b.end_date)
            AND (b.day_of_week IS NULL OR b.day_of_week = EXTRACT(DOW FROM NEW.slot_date)::int))
       )
  ) THEN
    RAISE EXCEPTION 'Slot does not correspond to an available booking block';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_slot_hold_limits ON public.slot_holds;
CREATE TRIGGER trg_enforce_slot_hold_limits
  BEFORE INSERT ON public.slot_holds
  FOR EACH ROW EXECUTE FUNCTION public.enforce_slot_hold_limits();
