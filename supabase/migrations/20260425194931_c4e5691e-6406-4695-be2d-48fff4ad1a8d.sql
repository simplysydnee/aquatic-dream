-- Announcements table
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','important','urgent')),
  pinned BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage announcements"
  ON public.announcements FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "Instructors view announcements"
  ON public.announcements FOR SELECT TO authenticated
  USING (
    current_user_instructor_id() IS NOT NULL
    AND (expires_at IS NULL OR expires_at > now())
  );

CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_announcements_pinned_created ON public.announcements (pinned DESC, created_at DESC);

-- Read receipts
CREATE TABLE public.announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, instructor_id)
);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors manage own reads"
  ON public.announcement_reads FOR ALL TO authenticated
  USING (instructor_id = current_user_instructor_id())
  WITH CHECK (instructor_id = current_user_instructor_id());

CREATE POLICY "Admins view all reads"
  ON public.announcement_reads FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'));

CREATE INDEX idx_announcement_reads_instructor ON public.announcement_reads (instructor_id);