CREATE OR REPLACE FUNCTION public.enforce_membership_slot_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity int;
  v_count int;
BEGIN
  -- Only statuses that occupy a spot are checked.
  IF NEW.standing_slot_id IS NULL OR NEW.status NOT IN ('active','pending_cancel','paused') THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, nothing to check when neither the slot nor the occupancy changed.
  IF TG_OP = 'UPDATE'
     AND OLD.standing_slot_id IS NOT DISTINCT FROM NEW.standing_slot_id
     AND OLD.status IN ('active','pending_cancel','paused') THEN
    RETURN NEW;
  END IF;

  -- Row lock serializes concurrent inserts for the same slot.
  SELECT capacity INTO v_capacity
  FROM public.standing_slots
  WHERE id = NEW.standing_slot_id
  FOR UPDATE;

  IF v_capacity IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.memberships m
  WHERE m.standing_slot_id = NEW.standing_slot_id
    AND m.status IN ('active','pending_cancel','paused')
    AND m.id IS DISTINCT FROM NEW.id;

  IF v_count + 1 > v_capacity THEN
    RAISE EXCEPTION 'MEMBERSHIP_SLOT_FULL: standing slot % is full (% of %)', NEW.standing_slot_id, v_count, v_capacity
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_membership_slot_capacity ON public.memberships;
CREATE TRIGGER trg_enforce_membership_slot_capacity
BEFORE INSERT OR UPDATE ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.enforce_membership_slot_capacity();