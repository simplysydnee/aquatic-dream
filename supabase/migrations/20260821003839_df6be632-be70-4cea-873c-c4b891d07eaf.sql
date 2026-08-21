ALTER TABLE public.membership_occurrences
  ADD COLUMN IF NOT EXISTS cancellation_id uuid REFERENCES public.membership_cancellations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_membership_occurrences_cancellation_id
  ON public.membership_occurrences (cancellation_id)
  WHERE cancellation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_membership_cancellation(
  p_membership_id uuid,
  p_cancellation_id uuid DEFAULT NULL,
  p_effective_date date DEFAULT NULL
)
RETURNS TABLE (cutoff_date date, cancelled_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Los_Angeles')::date;
  v_effective date;
  v_cutoff date;
  v_count integer;
BEGIN
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_effective := COALESCE(
    p_effective_date,
    (SELECT c.effective_date FROM public.membership_cancellations c WHERE c.id = p_cancellation_id),
    (SELECT m.cancel_effective_date FROM public.memberships m WHERE m.id = p_membership_id)
  );

  -- Respect the notice period: cancel from the effective date when it is in the
  -- future, otherwise from today. Never earlier than today.
  v_cutoff := GREATEST(v_today, COALESCE(v_effective, v_today));

  UPDATE public.membership_occurrences o
     SET status = 'cancelled',
         cancel_reason = COALESCE(o.cancel_reason, 'membership_cancelled'),
         cancellation_id = COALESCE(p_cancellation_id, o.cancellation_id)
   WHERE o.membership_id = p_membership_id
     AND o.occurrence_date >= v_cutoff
     AND o.status = 'scheduled';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_cutoff, v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_membership_cancellation(
  p_membership_id uuid,
  p_cancellation_id uuid DEFAULT NULL
)
RETURNS TABLE (restored_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Los_Angeles')::date;
  v_count integer;
BEGIN
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.membership_occurrences o
     SET status = 'scheduled',
         cancel_reason = NULL,
         cancellation_id = NULL
   WHERE o.membership_id = p_membership_id
     AND o.occurrence_date >= v_today
     AND o.status = 'cancelled'
     AND o.cancellation_id IS NOT NULL
     AND (p_cancellation_id IS NULL OR o.cancellation_id = p_cancellation_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_membership_cancellation(uuid, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_membership_cancellation(uuid, uuid) TO authenticated, service_role;