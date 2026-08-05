ALTER TABLE public.standing_slots
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE OR REPLACE FUNCTION public.stamp_standing_slot_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_standing_slot_update ON public.standing_slots;
CREATE TRIGGER trg_stamp_standing_slot_update
BEFORE INSERT OR UPDATE ON public.standing_slots
FOR EACH ROW EXECUTE FUNCTION public.stamp_standing_slot_update();