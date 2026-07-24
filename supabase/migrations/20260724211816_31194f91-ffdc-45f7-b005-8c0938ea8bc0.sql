
-- 1) studio_closures table
CREATE TABLE public.studio_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date date NOT NULL,
  end_date date NOT NULL,
  label text NOT NULL,
  closure_type public.closure_type NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_closures_range_ck CHECK (end_date >= start_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_closures TO authenticated;
GRANT ALL ON public.studio_closures TO service_role;

ALTER TABLE public.studio_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage studio_closures"
  ON public.studio_closures FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) closure_id column on membership_occurrences
ALTER TABLE public.membership_occurrences
  ADD COLUMN closure_id uuid REFERENCES public.studio_closures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_membership_occurrences_closure_id
  ON public.membership_occurrences(closure_id);

CREATE INDEX IF NOT EXISTS idx_studio_closures_dates
  ON public.studio_closures(start_date, end_date);

-- 3) Trigger: apply close logic on insert
CREATE OR REPLACE FUNCTION public.apply_studio_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.membership_occurrences
     SET status = 'closed',
         closure_type = NEW.closure_type,
         cancel_reason = NEW.label,
         closure_id = NEW.id
   WHERE occurrence_date BETWEEN NEW.start_date AND NEW.end_date
     AND status = 'scheduled';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_studio_closures_apply
AFTER INSERT ON public.studio_closures
FOR EACH ROW EXECUTE FUNCTION public.apply_studio_closure();

-- 4) Trigger: reopen on delete
CREATE OR REPLACE FUNCTION public.reopen_studio_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.membership_occurrences
     SET status = 'scheduled',
         closure_type = NULL,
         cancel_reason = NULL,
         closure_id = NULL
   WHERE closure_id = OLD.id
     AND status = 'closed';
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_studio_closures_reopen
BEFORE DELETE ON public.studio_closures
FOR EACH ROW EXECUTE FUNCTION public.reopen_studio_closure();

-- 5) Public RPC for upcoming closures
CREATE OR REPLACE FUNCTION public.get_upcoming_closures()
RETURNS TABLE (
  id uuid,
  start_date date,
  end_date date,
  label text,
  closure_type public.closure_type
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, start_date, end_date, label, closure_type
    FROM public.studio_closures
   WHERE end_date >= (now() AT TIME ZONE 'America/Los_Angeles')::date
   ORDER BY start_date ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_upcoming_closures() TO anon, authenticated, service_role;

-- 6) Seed Winter Break
INSERT INTO public.studio_closures (start_date, end_date, label, closure_type)
VALUES ('2026-12-24', '2027-01-01', 'Winter Break', 'planned');
