ALTER TABLE public.lesson_requests
  ADD COLUMN IF NOT EXISTS last_replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reply_message text;