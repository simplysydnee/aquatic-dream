-- 1. Level lock trigger (kid_group only)
CREATE OR REPLACE FUNCTION public.lock_slot_level_on_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
         SET accepted_levels = ARRAY[NEW.swim_level]
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

DROP TRIGGER IF EXISTS trg_membership_level_lock ON public.memberships;
CREATE TRIGGER trg_membership_level_lock
BEFORE INSERT ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.lock_slot_level_on_membership();

-- Unlock when the last occupying membership leaves
CREATE OR REPLACE FUNCTION public.unlock_slot_level_when_empty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    UPDATE public.standing_slots SET accepted_levels = NULL WHERE id = target_slot;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_membership_level_unlock ON public.memberships;
CREATE TRIGGER trg_membership_level_unlock
AFTER UPDATE OR DELETE ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.unlock_slot_level_when_empty();

-- 2. Backfill
UPDATE public.standing_slots s
   SET accepted_levels = NULL
 WHERE s.plan_key = 'kid_group'
   AND s.active
   AND NOT EXISTS (
     SELECT 1 FROM public.memberships m
      WHERE m.standing_slot_id = s.id
        AND m.status IN ('active', 'pending_cancel', 'paused'));

UPDATE public.standing_slots s
   SET accepted_levels = sub.levels
  FROM (
    SELECT m.standing_slot_id, array_agg(DISTINCT m.swim_level) AS levels
      FROM public.memberships m
     WHERE m.status IN ('active', 'pending_cancel', 'paused')
       AND m.swim_level IS NOT NULL
     GROUP BY m.standing_slot_id
  ) sub
 WHERE s.id = sub.standing_slot_id
   AND s.plan_key = 'kid_group'
   AND s.active;