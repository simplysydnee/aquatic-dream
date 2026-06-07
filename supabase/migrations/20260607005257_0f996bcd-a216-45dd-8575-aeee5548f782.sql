CREATE TABLE public.waitlist_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_first_name text NOT NULL,
  parent_last_name text NOT NULL,
  parent_email text NOT NULL,
  parent_phone text,
  child_first_name text NOT NULL,
  child_last_name text NOT NULL,
  child_age integer,
  swim_level text,
  session_id uuid,
  source_page text,
  notes text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.waitlist_requests TO authenticated;
GRANT INSERT ON public.waitlist_requests TO anon;
GRANT ALL ON public.waitlist_requests TO service_role;

ALTER TABLE public.waitlist_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit waitlist request"
  ON public.waitlist_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins view waitlist"
  ON public.waitlist_requests FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update waitlist"
  ON public.waitlist_requests FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_waitlist_requests_updated_at
  BEFORE UPDATE ON public.waitlist_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();