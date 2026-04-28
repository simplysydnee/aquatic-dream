CREATE TABLE public.internal_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('swimmer', 'lesson_request')),
  target_key TEXT NOT NULL,
  body TEXT NOT NULL,
  author_id UUID,
  author_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_internal_comments_target ON public.internal_comments (target_type, target_key);
CREATE INDEX idx_internal_comments_created ON public.internal_comments (created_at DESC);

ALTER TABLE public.internal_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all comments"
ON public.internal_comments FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins create comments"
ON public.internal_comments FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND author_id = auth.uid());

CREATE POLICY "Admins update own comments"
ON public.internal_comments FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND author_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND author_id = auth.uid());

CREATE POLICY "Admins delete own comments"
ON public.internal_comments FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND author_id = auth.uid());

CREATE TRIGGER update_internal_comments_updated_at
BEFORE UPDATE ON public.internal_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_comments;