UPDATE public.memberships SET stripe_session_id = NULL
 WHERE id IN ('3072573b-7ce1-4f7b-a4ba-490627f38e0e','141f787c-d2b3-4720-b728-d12dd586557e','0e05b950-e4fd-4dc2-b606-4f5612d85dd3');

DO $$
DECLARE d int;
BEGIN
  SELECT count(*) INTO d FROM (
    SELECT stripe_session_id FROM public.memberships
     WHERE stripe_session_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x;
  IF d > 0 THEN RAISE EXCEPTION 'duplicate stripe_session_id groups remain: %', d; END IF;

  SELECT count(*) INTO d FROM (
    SELECT stripe_subscription_id FROM public.memberships
     WHERE stripe_subscription_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x;
  IF d > 0 THEN RAISE EXCEPTION 'duplicate stripe_subscription_id groups remain: %', d; END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS memberships_stripe_session_id_uniq
  ON public.memberships (stripe_session_id) WHERE stripe_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS memberships_stripe_subscription_id_uniq
  ON public.memberships (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;