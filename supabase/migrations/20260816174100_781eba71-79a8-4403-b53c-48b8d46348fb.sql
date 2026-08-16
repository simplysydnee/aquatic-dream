CREATE OR REPLACE FUNCTION public.lock_slot_level_on_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
                               END,
             swim_level = NEW.swim_level
       WHERE id = NEW.standing_slot_id;
    END IF;
  ELSIF slot_row.accepted_levels IS NOT NULL
        AND array_length(slot_row.accepted_levels, 1) > 0
        AND NOT (NEW.swim_level = ANY (slot_row.accepted_levels)) THEN
    RAISE EXCEPTION 'MEMBERSHIP_LEVEL_MISMATCH: this class is set to a different swim group';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unlock_slot_level_when_empty()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_slot uuid;
  occupying_count integer;
BEGIN
  target_slot := OLD.standing_slot_id;
  IF OLD.plan_key IS DISTINCT FROM 'kid_group' OR target_slot IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NOT (OLD.status IN ('active', 'pending_cancel', 'paused')) THEN
      RETURN NULL;
    END IF;
    IF NEW.status IN ('active', 'pending_cancel', 'paused')
       AND NEW.standing_slot_id = target_slot THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT count(*) INTO occupying_count
    FROM public.memberships m
   WHERE m.standing_slot_id = target_slot
     AND m.status IN ('active', 'pending_cancel', 'paused');

  IF occupying_count = 0 THEN
    UPDATE public.standing_slots
       SET accepted_levels = NULL,
           swim_level = NULL
     WHERE id = target_slot;
  END IF;

  RETURN NULL;
END;
$function$;

UPDATE public.standing_slots s
   SET swim_level = (
     SELECT m.swim_level
       FROM public.memberships m
      WHERE m.standing_slot_id = s.id
        AND m.status IN ('active', 'pending_cancel', 'paused')
        AND m.swim_level IS NOT NULL
      ORDER BY m.created_at
      LIMIT 1
   )
 WHERE s.plan_key = 'kid_group'
   AND s.accepted_levels IS NOT NULL
   AND array_length(s.accepted_levels, 1) > 0
   AND EXISTS (
     SELECT 1 FROM public.memberships m
      WHERE m.standing_slot_id = s.id
        AND m.status IN ('active', 'pending_cancel', 'paused')
        AND m.swim_level IS NOT NULL
   );

UPDATE public.standing_slots
   SET swim_level = NULL
 WHERE plan_key = 'kid_group'
   AND (accepted_levels IS NULL OR array_length(accepted_levels, 1) = 0)
   AND swim_level IS NOT NULL;