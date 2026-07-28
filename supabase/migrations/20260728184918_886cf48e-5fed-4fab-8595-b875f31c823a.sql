ALTER TABLE public.standing_slots ADD COLUMN IF NOT EXISTS accepted_levels text[] NULL;

UPDATE public.standing_slots
SET accepted_levels = ARRAY[swim_level]
WHERE swim_level IS NOT NULL AND accepted_levels IS NULL;

CREATE TABLE public.membership_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text NOT NULL,
  standing_slot_id uuid NULL REFERENCES public.standing_slots(id),
  swim_level text NULL,
  preferred_day int NULL,
  preferred_time time NULL,
  swimmer_name text NOT NULL,
  parent_name text NOT NULL,
  parent_email text NOT NULL,
  parent_phone text NOT NULL,
  notes text NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  contacted_at timestamptz NULL
);

GRANT SELECT, INSERT, UPDATE ON public.membership_waitlist TO authenticated;
GRANT INSERT ON public.membership_waitlist TO anon;
GRANT ALL ON public.membership_waitlist TO service_role;

ALTER TABLE public.membership_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit membership waitlist request"
  ON public.membership_waitlist FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins view membership waitlist"
  ON public.membership_waitlist FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update membership waitlist"
  ON public.membership_waitlist FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));