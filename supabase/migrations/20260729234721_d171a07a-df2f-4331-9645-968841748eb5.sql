CREATE TABLE public.membership_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  plan_key text NOT NULL,
  standing_slot_id uuid NOT NULL REFERENCES public.standing_slots(id),
  swim_level text NULL,
  swimmer_name text NOT NULL,
  parent_name text NOT NULL,
  parent_phone text NOT NULL,
  parent_email text NULL,
  existing_waiver_id uuid NULL,
  notes text NULL,
  status text NOT NULL DEFAULT 'held',
  held_until timestamptz NOT NULL,
  sms_sent_at timestamptz NULL,
  reminder_sent_at timestamptz NULL,
  converted_at timestamptz NULL,
  expired_at timestamptz NULL,
  created_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT membership_holds_status_check CHECK (status IN ('held','converted','expired','cancelled'))
);

GRANT SELECT, INSERT, UPDATE ON public.membership_holds TO authenticated;
GRANT ALL ON public.membership_holds TO service_role;

ALTER TABLE public.membership_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view membership holds"
ON public.membership_holds FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create membership holds"
ON public.membership_holds FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update membership holds"
ON public.membership_holds FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_membership_holds_slot_active
  ON public.membership_holds (standing_slot_id, status, held_until);
CREATE INDEX idx_membership_holds_status_expiry
  ON public.membership_holds (status, held_until);