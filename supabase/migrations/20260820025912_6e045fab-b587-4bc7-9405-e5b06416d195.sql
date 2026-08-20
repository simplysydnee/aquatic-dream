CREATE TABLE public.private_slot_gating_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week smallint NOT NULL UNIQUE CHECK (day_of_week BETWEEN 0 AND 6),
  primary_instructor_id uuid NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.private_slot_gating_rules TO authenticated;
GRANT ALL ON public.private_slot_gating_rules TO service_role;

ALTER TABLE public.private_slot_gating_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view private slot gating rules"
ON public.private_slot_gating_rules
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_private_slot_gating_rules_updated_at
BEFORE UPDATE ON public.private_slot_gating_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.private_slot_gating_rules (day_of_week, primary_instructor_id, active)
SELECT 3, id, true FROM public.instructors WHERE name = 'Karolina Imfeld' LIMIT 1;

INSERT INTO public.private_slot_gating_rules (day_of_week, primary_instructor_id, active)
SELECT 4, id, true FROM public.instructors WHERE name = 'Liana Herrera' LIMIT 1;