
-- Enums
CREATE TYPE public.membership_plan_key AS ENUM ('kid_group','private','adult_group');
CREATE TYPE public.membership_status AS ENUM ('active','pending_cancel','cancelled','paused');
CREATE TYPE public.cancellation_reason AS ENUM ('too_busy','graduated','cost','moved','other');
CREATE TYPE public.closure_type AS ENUM ('planned','unplanned');

-- membership_plans
CREATE TABLE public.membership_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key public.membership_plan_key UNIQUE NOT NULL,
  name text NOT NULL,
  monthly_price_cents integer NOT NULL,
  capacity_per_slot integer NOT NULL,
  stripe_product_id text,
  stripe_price_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.membership_plans TO anon, authenticated;
GRANT ALL ON public.membership_plans TO service_role;
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view active plans" ON public.membership_plans
  FOR SELECT USING (active = true);
CREATE POLICY "Admins manage plans" ON public.membership_plans
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.membership_plans (plan_key, name, monthly_price_cents, capacity_per_slot) VALUES
  ('kid_group','Group Membership',14000,3),
  ('private','Private Membership',20000,1),
  ('adult_group','Adult Group Membership',14000,2);

-- standing_slots
CREATE TABLE public.standing_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key public.membership_plan_key NOT NULL,
  instructor_id uuid REFERENCES public.instructors(id),
  day_of_week integer NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  capacity integer NOT NULL,
  location text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.standing_slots TO authenticated;
GRANT ALL ON public.standing_slots TO service_role;
ALTER TABLE public.standing_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage standing_slots" ON public.standing_slots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- memberships
CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key public.membership_plan_key NOT NULL,
  standing_slot_id uuid REFERENCES public.standing_slots(id),
  child_first_name text,
  child_last_name text,
  parent_email text NOT NULL,
  parent_phone text,
  status public.membership_status NOT NULL DEFAULT 'active',
  start_date date,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_requested_at timestamptz,
  cancel_effective_date date,
  recurring_consent_at timestamptz,
  recurring_consent_version text,
  recurring_consent_amount_cents integer,
  sms_consent boolean DEFAULT false,
  sms_consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage memberships" ON public.memberships
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- membership_occurrences
CREATE TABLE public.membership_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  start_time time,
  end_time time,
  instructor_id uuid REFERENCES public.instructors(id),
  status text NOT NULL DEFAULT 'scheduled',
  closure_type public.closure_type,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.membership_occurrences TO authenticated;
GRANT ALL ON public.membership_occurrences TO service_role;
ALTER TABLE public.membership_occurrences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage membership_occurrences" ON public.membership_occurrences
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- membership_cancellations
CREATE TABLE public.membership_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  effective_date date NOT NULL,
  reason public.cancellation_reason,
  reason_detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.membership_cancellations TO authenticated;
GRANT ALL ON public.membership_cancellations TO service_role;
ALTER TABLE public.membership_cancellations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage membership_cancellations" ON public.membership_cancellations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
