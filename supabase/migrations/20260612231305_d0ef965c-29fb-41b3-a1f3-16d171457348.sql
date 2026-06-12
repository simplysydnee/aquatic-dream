CREATE OR REPLACE FUNCTION public.prevent_lesson_occurrence_double_book()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_instructor_id uuid;
  v_start time;
  v_end time;
  v_conflict_id uuid;
  v_booking_start time;
  v_booking_end time;
  v_booking_instructor uuid;
BEGIN
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

  -- Reject if a blackout (closed) block overlaps for this instructor/date/time
  IF EXISTS (
    SELECT 1 FROM public.instructor_booking_blocks b
     WHERE b.instructor_id = v_instructor_id
       AND b.is_blackout = true
       AND v_start < b.end_time
       AND v_end   > b.start_time
       AND (
         (b.kind = 'weekly' AND b.day_of_week = EXTRACT(DOW FROM NEW.occurrence_date)::int
            AND (b.start_date IS NULL OR NEW.occurrence_date >= b.start_date)
            AND (b.end_date   IS NULL OR NEW.occurrence_date <= b.end_date))
         OR
         (b.kind = 'date_range'
            AND (b.start_date IS NULL OR NEW.occurrence_date >= b.start_date)
            AND (b.end_date   IS NULL OR NEW.occurrence_date <= b.end_date)
            AND (b.day_of_week IS NULL OR b.day_of_week = EXTRACT(DOW FROM NEW.occurrence_date)::int))
       )
  ) THEN
    RAISE EXCEPTION 'slot_closed: instructor % is closed on % for % - %',
      v_instructor_id, NEW.occurrence_date, v_start, v_end
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT o.id INTO v_conflict_id
    FROM public.lesson_booking_occurrences o
    JOIN public.lesson_bookings b ON b.id = o.booking_id
   WHERE o.id <> NEW.id
     AND o.occurrence_date = NEW.occurrence_date
     AND o.status <> 'cancelled'
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
$function$;