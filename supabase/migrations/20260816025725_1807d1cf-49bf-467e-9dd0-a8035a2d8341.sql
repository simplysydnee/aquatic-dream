CREATE OR REPLACE FUNCTION public.lock_slot_level_on_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  slot_row public.standing_slots%ROWTYPE;
  occupying_count integer;
BEGIN
  IF NEW.plan_key IS DISTINCT FROM 'kid_group' OR NEW.standing_slot_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('active', 'pending_cancel', 'paused') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO slot_row FROM public.standing_slots
   WHERE id = NEW.standing_slot_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO occupying_count
    FROM public.memberships m
   WHERE m.standing_slot_id = NEW.standing_slot_id
     AND m.status IN ('active', 'pending_cancel', 'paused')
     AND m.id IS DISTINCT FROM NEW.id;

  IF occupying_count = 0 THEN
    IF NEW.swim_level IS NOT NULL THEN
      UPDATE public.standing_slots
         SET accepted_levels = CASE NEW.swim_level
                                 WHEN 'white' THEN ARRAY['white']
                                 WHEN 'red' THEN ARRAY['red']
                                 WHEN 'yellow' THEN ARRAY['yellow']
                                 WHEN 'blue' THEN ARRAY['blue','green']
                                 WHEN 'green' THEN ARRAY['blue','green']
                                 ELSE ARRAY[NEW.swim_level]
                               END
       WHERE id = NEW.standing_slot_id;
    END IF;
  ELSIF slot_row.accepted_levels IS NOT NULL
        AND array_length(slot_row.accepted_levels, 1) > 0
        AND NOT (NEW.swim_level = ANY (slot_row.accepted_levels)) THEN
    RAISE EXCEPTION 'MEMBERSHIP_LEVEL_MISMATCH: this class is set to a different swim group';
  END IF;

  RETURN NEW;
END;
$$;