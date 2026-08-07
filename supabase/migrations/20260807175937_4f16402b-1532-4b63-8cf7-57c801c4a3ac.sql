CREATE TABLE IF NOT EXISTS public.sms_conversation_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.sms_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_conversation_reads TO authenticated;
GRANT ALL ON public.sms_conversation_reads TO service_role;

ALTER TABLE public.sms_conversation_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage their own sms read markers"
ON public.sms_conversation_reads
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_sms_conversation_reads_updated_at
BEFORE UPDATE ON public.sms_conversation_reads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.unread_sms_conversation_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 0
    WHEN NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'instructor')) THEN 0
    ELSE (
      SELECT count(DISTINCT m.conversation_id)::int
      FROM public.sms_messages m
      LEFT JOIN public.sms_conversation_reads r
        ON r.conversation_id = m.conversation_id AND r.user_id = auth.uid()
      WHERE m.direction = 'inbound'
        AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
    )
  END
$$;

REVOKE EXECUTE ON FUNCTION public.unread_sms_conversation_count() FROM anon;
GRANT EXECUTE ON FUNCTION public.unread_sms_conversation_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_sms_conversation_read(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'instructor')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.sms_conversation_reads (conversation_id, user_id, last_read_at)
  VALUES (_conversation_id, auth.uid(), now())
  ON CONFLICT (conversation_id, user_id)
  DO UPDATE SET last_read_at = now(), updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_sms_conversation_read(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_sms_conversation_read(uuid) TO authenticated;