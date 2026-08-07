REVOKE EXECUTE ON FUNCTION public.unread_sms_conversation_count() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_sms_conversation_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unread_sms_conversation_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_sms_conversation_read(uuid) TO authenticated;