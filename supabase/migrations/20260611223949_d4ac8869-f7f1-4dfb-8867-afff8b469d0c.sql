
CREATE OR REPLACE FUNCTION public.prevent_lesson_occurrence_double_book()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instructor_id uuid;
  v_start time;
  v_end time;
  v_conflict_id uuid;
  v_booking_start time;
  v_booking_end time;
  v_booking_instructor uuid;
BEGIN
  -- Skip checks on cancelled rows; we never block cancellation.
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT instructor_id, start_time, end_time
    INTO v_booking_instructor, v_booking_start, v_booking_end
    FROM public.lesson_bookings WHERE id = NEW.booking_id;

  v_instructor_id := COALESCE(NEW.instructor_override_id, v_booking_instructor);
  v_start := COALESCE(NEW.start_time_override, v_booking_start);
  v_end   := COALESCE(NEW.end_time_override, v_booking_end);

  IF v_instructor_id IS NULL OR v_start IS NULL OR v_end IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.id INTO v_conflict_id
    FROM public.lesson_booking_occurrences o
    JOIN public.lesson_bookings b ON b.id = o.booking_id
   WHERE o.id <> NEW.id
     AND o.occurrence_date = NEW.occurrence_date
     AND o.status <> 'cancelled'
     -- Ignore stale pending_card holds (abandoned checkouts) so they don't lock the slot forever.
     AND NOT (o.status = 'pending_card' AND o.created_at < now() - interval '30 minutes')
     AND COALESCE(o.instructor_override_id, b.instructor_id) = v_instructor_id
     AND v_start < COALESCE(o.end_time_override, b.end_time)
     AND v_end   > COALESCE(o.start_time_override, b.start_time)
   LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'double_book: instructor % already has a lesson on % overlapping % - %',
      v_instructor_id, NEW.occurrence_date, v_start, v_end
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_lesson_double_book ON public.lesson_booking_occurrences;
CREATE TRIGGER trg_prevent_lesson_double_book
BEFORE INSERT OR UPDATE OF occurrence_date, start_time_override, end_time_override, instructor_override_id, status
ON public.lesson_booking_occurrences
FOR EACH ROW
EXECUTE FUNCTION public.prevent_lesson_occurrence_double_book();
