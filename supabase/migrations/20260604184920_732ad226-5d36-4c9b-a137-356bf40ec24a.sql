-- Fix overly broad shifts SELECT policy
DROP POLICY IF EXISTS "Authenticated can view shifts" ON public.shifts;

-- Remove admin-only tables from realtime publication so subscriptions
-- can't be used to receive sensitive payloads
ALTER PUBLICATION supabase_realtime DROP TABLE public.internal_comments;
ALTER PUBLICATION supabase_realtime DROP TABLE public.marketing_campaigns;