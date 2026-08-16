DROP POLICY IF EXISTS "Anyone can submit membership waitlist request" ON public.membership_waitlist;
REVOKE INSERT ON public.membership_waitlist FROM anon;
REVOKE INSERT ON public.membership_waitlist FROM authenticated;