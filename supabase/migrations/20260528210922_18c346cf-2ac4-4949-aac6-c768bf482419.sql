-- 1) Instructor booking blocks
CREATE TABLE public.instructor_booking_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('weekly','date_range')),
  day_of_week integer CHECK (day_of_week BETWEEN 0 AND 6),
  start_date date,
  end_date date,
  start_time time NOT NULL,
  end_time time NOT NULL,
  slot_minutes integer NOT NULL DEFAULT 30 CHECK (slot_minutes > 0),
  pool_area text NOT NULL DEFAULT 'shallow',
  is_blackout boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.instructor_booking_blocks TO anon;
GRANT SELECT ON public.instructor_booking_blocks TO authenticated;
GRANT ALL ON public.instructor_booking_blocks TO service_role;

ALTER TABLE public.instructor_booking_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view booking blocks"
  ON public.instructor_booking_blocks FOR SELECT
  USING (true);

CREATE POLICY "Admins manage booking blocks"
  ON public.instructor_booking_blocks FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_booking_blocks_instructor ON public.instructor_booking_blocks(instructor_id);

CREATE TRIGGER trg_booking_blocks_updated_at
  BEFORE UPDATE ON public.instructor_booking_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Slot holds (short-lived reservations)
CREATE TABLE public.slot_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL,
  instructor_id uuid NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  slot_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  held_until timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.slot_holds TO anon;
GRANT SELECT, INSERT, DELETE ON public.slot_holds TO authenticated;
GRANT ALL ON public.slot_holds TO service_role;

ALTER TABLE public.slot_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active slot holds"
  ON public.slot_holds FOR SELECT
  USING (held_until > now());

CREATE POLICY "Anyone can create slot holds"
  ON public.slot_holds FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can delete own slot holds"
  ON public.slot_holds FOR DELETE
  USING (true);

CREATE INDEX idx_slot_holds_instructor_date ON public.slot_holds(instructor_id, slot_date);
CREATE INDEX idx_slot_holds_session_token ON public.slot_holds(session_token);

-- 3) Extend lesson_bookings
ALTER TABLE public.lesson_bookings
  ADD COLUMN IF NOT EXISTS booking_source text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text,
  ADD COLUMN IF NOT EXISTS cancellation_policy_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS instructor_id uuid REFERENCES public.instructors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS child_age integer;

-- 4) Extend lesson_booking_occurrences
ALTER TABLE public.lesson_booking_occurrences
  ADD COLUMN IF NOT EXISTS auto_charge_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS auto_charge_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_charge_error text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS cancel_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lbo_cancel_token ON public.lesson_booking_occurrences(cancel_token) WHERE cancel_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lbo_charge_lookup ON public.lesson_booking_occurrences(occurrence_date, auto_charge_status);

-- 5) RPC for token-based occurrence lookup
CREATE OR REPLACE FUNCTION public.get_occurrence_by_cancel_token(_token text)
RETURNS TABLE(
  id uuid, booking_id uuid, occurrence_date date,
  status text, payment_status text, auto_charge_status text,
  parent_name text, parent_email text, child_name text,
  start_time time, end_time time, instructor_name text,
  cancellation_policy_hours integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.booking_id, o.occurrence_date,
         o.status, o.payment_status, o.auto_charge_status,
         b.parent_name, b.parent_email, b.child_name,
         b.start_time, b.end_time, b.instructor_name,
         b.cancellation_policy_hours
    FROM public.lesson_booking_occurrences o
    JOIN public.lesson_bookings b ON b.id = o.booking_id
   WHERE o.cancel_token = _token
   LIMIT 1;
$$;