ALTER TABLE public.pending_memberships
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by text;

-- Atomic claim: single conditional UPDATE, no read-then-write gap.
CREATE OR REPLACE FUNCTION public.claim_pending_membership(p_pending_id uuid, p_claimer text)
RETURNS TABLE (id uuid, payload jsonb, stripe_session_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.pending_memberships pm
     SET claimed_at = now(),
         claimed_by = p_claimer
   WHERE pm.id = p_pending_id
     AND (pm.claimed_at IS NULL OR pm.claimed_at < now() - interval '90 seconds')
  RETURNING pm.id, pm.payload, pm.stripe_session_id;
$$;

-- Conditional payload write: never overwrite an existing subscription id.
CREATE OR REPLACE FUNCTION public.set_pending_membership_subscription(p_id uuid, p_sub text)
RETURNS TABLE (written boolean, stored_subscription_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
  v_stored text;
BEGIN
  UPDATE public.pending_memberships pm
     SET payload = jsonb_set(pm.payload, '{stripe_subscription_id}', to_jsonb(p_sub), true)
   WHERE pm.id = p_id
     AND (pm.payload->>'stripe_subscription_id') IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT pm.payload->>'stripe_subscription_id' INTO v_stored
    FROM public.pending_memberships pm WHERE pm.id = p_id;

  RETURN QUERY SELECT (v_updated = 1), v_stored;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_membership(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_pending_membership_subscription(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_membership(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_pending_membership_subscription(uuid, text) TO service_role;