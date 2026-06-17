-- SMS inbox: conversations + messages
CREATE TABLE public.sms_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_phone text NOT NULL UNIQUE,
  parent_name text,
  last_message_at timestamptz,
  last_message_preview text,
  last_direction text CHECK (last_direction IN ('inbound','outbound')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sms_conversations_last_message_at_idx
  ON public.sms_conversations (last_message_at DESC NULLS LAST);

GRANT SELECT, INSERT, UPDATE ON public.sms_conversations TO authenticated;
GRANT ALL ON public.sms_conversations TO service_role;

ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view conversations"
  ON public.sms_conversations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'instructor'));

CREATE POLICY "Staff can insert conversations"
  ON public.sms_conversations FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'instructor'));

CREATE POLICY "Staff can update conversations"
  ON public.sms_conversations FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'instructor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'instructor'));

CREATE TRIGGER trg_sms_conversations_updated_at
  BEFORE UPDATE ON public.sms_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.sms_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  body text NOT NULL,
  sent_by uuid,
  status text NOT NULL CHECK (status IN ('sent','delivered','failed','received')),
  error text,
  textmagic_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sms_messages_conversation_id_created_at_idx
  ON public.sms_messages (conversation_id, created_at);

GRANT SELECT, INSERT ON public.sms_messages TO authenticated;
GRANT ALL ON public.sms_messages TO service_role;

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view messages"
  ON public.sms_messages FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'instructor'));

CREATE POLICY "Staff can insert messages"
  ON public.sms_messages FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'instructor'));

-- Realtime
ALTER TABLE public.sms_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.sms_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_messages;
