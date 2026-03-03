
-- Create update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ==========================================
-- SWIM SESSIONS (schedule slots)
-- ==========================================
CREATE TABLE public.swim_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  swim_level TEXT NOT NULL CHECK (swim_level IN ('pearls', 'reef-explorers', 'sharks', 'sea-turtles', 'octopus-elite')),
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_students INTEGER NOT NULL DEFAULT 4,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.swim_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view swim sessions" ON public.swim_sessions
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage sessions" ON public.swim_sessions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_swim_sessions_updated_at
  BEFORE UPDATE ON public.swim_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- SWIM ENROLLMENTS
-- ==========================================
CREATE TABLE public.swim_enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_name TEXT NOT NULL,
  parent_email TEXT NOT NULL,
  parent_phone TEXT,
  child_name TEXT NOT NULL,
  child_age INTEGER NOT NULL,
  swim_level TEXT NOT NULL CHECK (swim_level IN ('pearls', 'reef-explorers', 'sharks', 'sea-turtles', 'octopus-elite')),
  session_id UUID REFERENCES public.swim_sessions(id),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.swim_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit swim enrollment" ON public.swim_enrollments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can view enrollments" ON public.swim_enrollments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update enrollments" ON public.swim_enrollments
  FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_swim_enrollments_updated_at
  BEFORE UPDATE ON public.swim_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- DIVE COURSE BOOKINGS
-- ==========================================
CREATE TABLE public.dive_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  course_name TEXT NOT NULL,
  preferred_date DATE,
  experience_level TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dive_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit dive booking" ON public.dive_bookings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can view dive bookings" ON public.dive_bookings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update dive bookings" ON public.dive_bookings
  FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_dive_bookings_updated_at
  BEFORE UPDATE ON public.dive_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- TRIP RESERVATIONS
-- ==========================================
CREATE TABLE public.trip_reservations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  destination TEXT NOT NULL,
  trip_dates TEXT NOT NULL,
  number_of_divers INTEGER NOT NULL DEFAULT 1,
  certification_level TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit trip reservation" ON public.trip_reservations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can view trip reservations" ON public.trip_reservations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update trip reservations" ON public.trip_reservations
  FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_trip_reservations_updated_at
  BEFORE UPDATE ON public.trip_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- CONTACT SUBMISSIONS
-- ==========================================
CREATE TABLE public.contact_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  source_page TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit contact form" ON public.contact_submissions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can view submissions" ON public.contact_submissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update submissions" ON public.contact_submissions
  FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_contact_submissions_updated_at
  BEFORE UPDATE ON public.contact_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
