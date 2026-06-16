
CREATE TABLE public.reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swimmer_name text,
  lesson_occurrence_id uuid NULL REFERENCES public.lesson_booking_occurrences(id) ON DELETE SET NULL,
  session_lesson_date_id uuid NULL REFERENCES public.session_lesson_dates(id) ON DELETE SET NULL,
  enrollment_id uuid NULL REFERENCES public.swim_enrollments(id) ON DELETE SET NULL,
  booking_id uuid NULL REFERENCES public.lesson_bookings(id) ON DELETE SET NULL,
  channel text NOT NULL,
  reminder_kind text NOT NULL,
  phone text,
  message text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  status text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.reminder_logs TO authenticated;
GRANT ALL ON public.reminder_logs TO service_role;

ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view reminder logs"
  ON public.reminder_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_reminder_logs_occ ON public.reminder_logs(lesson_occurrence_id, channel, status);
CREATE INDEX idx_reminder_logs_group ON public.reminder_logs(session_lesson_date_id, enrollment_id, channel, reminder_kind, status);
CREATE INDEX idx_reminder_logs_created ON public.reminder_logs(created_at);
