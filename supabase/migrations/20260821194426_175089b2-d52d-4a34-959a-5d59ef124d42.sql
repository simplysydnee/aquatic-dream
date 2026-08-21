CREATE OR REPLACE FUNCTION public.admin_resolve_swimmer_match(p_review_id uuid, p_action text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_review   record;
  m          record;
  v_swimmer  uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_action NOT IN ('same', 'different') THEN
    RAISE EXCEPTION 'unknown action %', p_action;
  END IF;

  SELECT * INTO v_review
  FROM swimmer_match_reviews
  WHERE id = p_review_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found';
  END IF;

  IF v_review.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'review already resolved';
  END IF;

  SELECT id, swimmer_id, child_first_name, child_last_name, child_dob, plan_key, swim_level
    INTO m
  FROM memberships
  WHERE id = v_review.membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found';
  END IF;

  IF m.swimmer_id IS NOT NULL THEN
    RAISE EXCEPTION 'membership already linked to a swimmer';
  END IF;

  IF p_action = 'same' THEN
    IF v_review.candidate_swimmer_id IS NULL THEN
      RAISE EXCEPTION 'no candidate swimmer on this review';
    END IF;
    v_swimmer := v_review.candidate_swimmer_id;
  ELSE
    IF m.child_dob IS NULL
       OR coalesce(trim(m.child_first_name), '') = ''
       OR coalesce(trim(m.child_last_name), '') = '' THEN
      RAISE EXCEPTION 'membership is missing a name or date of birth';
    END IF;

    INSERT INTO swimmers (first_name, last_name, dob, current_level, level_set_at)
    VALUES (
      trim(m.child_first_name),
      trim(m.child_last_name),
      m.child_dob,
      CASE WHEN m.plan_key::text = 'kid_group' THEN m.swim_level ELSE NULL END,
      CASE WHEN m.plan_key::text = 'kid_group' AND m.swim_level IS NOT NULL THEN now() ELSE NULL END
    )
    RETURNING id INTO v_swimmer;

    IF m.plan_key::text = 'kid_group' AND m.swim_level IS NOT NULL THEN
      INSERT INTO swimmer_level_history (swimmer_id, from_level, to_level, reason)
      VALUES (v_swimmer, NULL, m.swim_level, 'initial');
    END IF;
  END IF;

  UPDATE memberships SET swimmer_id = v_swimmer WHERE id = m.id;

  UPDATE swimmer_match_reviews
     SET resolved_at = now(), resolved_by = auth.uid()
   WHERE id = p_review_id;

  RETURN v_swimmer;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_resolve_swimmer_match(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_swimmer_match(uuid, text) TO authenticated;