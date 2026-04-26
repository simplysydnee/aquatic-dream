
CREATE TABLE public.lesson_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_type TEXT NOT NULL CHECK (lesson_type IN ('private','semi-private')),
  parent_name TEXT NOT NULL,
  parent_email TEXT NOT NULL,
  parent_phone TEXT,
  child_name TEXT,
  price_per_session NUMERIC NOT NULL DEFAULT 65,
  instructor_name TEXT,
  pool_area TEXT NOT NULL DEFAULT 'shallow',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  recurring BOOLEAN NOT NULL DEFAULT false,
  frequency TEXT CHECK (frequency IN ('weekly','biweekly')),
  recur_days TEXT[] DEFAULT '{}',
  series_start DATE NOT NULL,
  series_end DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.lesson_booking_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.lesson_bookings(id) ON DELETE CASCADE,
  pool_event_id UUID REFERENCES public.pool_events(id) ON DELETE SET NULL,
  occurrence_date DATE NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','comp','refunded','flagged_no_pay')),
  stripe_checkout_url TEXT,
  stripe_session_id TEXT,
  paid_at TIMESTAMPTZ,
  payment_link_sent_at TIMESTAMPTZ,
  reminder_attempted_at TIMESTAMPTZ,
  payment_method TEXT,
  payment_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lesson_bookings_email ON public.lesson_bookings (parent_email);
CREATE INDEX idx_lesson_booking_occ_booking ON public.lesson_booking_occurrences (booking_id);
CREATE INDEX idx_lesson_booking_occ_date ON public.lesson_booking_occurrences (occurrence_date);
CREATE INDEX idx_lesson_booking_occ_pool_event ON public.lesson_booking_occurrences (pool_event_id);

ALTER TABLE public.lesson_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_booking_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage lesson bookings"
ON public.lesson_bookings FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin'))
WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "Service role manages lesson bookings"
ON public.lesson_bookings FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins manage lesson occurrences"
ON public.lesson_booking_occurrences FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin'))
WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "Service role manages lesson occurrences"
ON public.lesson_booking_occurrences FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_lesson_bookings_updated
  BEFORE UPDATE ON public.lesson_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_lesson_booking_occ_updated
  BEFORE UPDATE ON public.lesson_booking_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
