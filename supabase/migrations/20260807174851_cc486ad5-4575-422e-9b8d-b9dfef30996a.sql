ALTER TABLE public.sms_messages ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.sms_messages ADD COLUMN IF NOT EXISTS sent_by_label text;
CREATE INDEX IF NOT EXISTS idx_sms_messages_conversation_created ON public.sms_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sms_conversations_parent_phone ON public.sms_conversations (parent_phone);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sms_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_messages';
  END IF;
END $$;