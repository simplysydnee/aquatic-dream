
-- Create session_periods table
CREATE TABLE public.session_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.session_periods ENABLE ROW LEVEL SECURITY;

-- Public can read
CREATE POLICY "Anyone can view session periods"
ON public.session_periods FOR SELECT
USING (true);

-- Authenticated can manage
CREATE POLICY "Authenticated users can manage session periods"
ON public.session_periods FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Add updated_at trigger
CREATE TRIGGER update_session_periods_updated_at
BEFORE UPDATE ON public.session_periods
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add session_period_id FK to swim_sessions
ALTER TABLE public.swim_sessions
ADD COLUMN session_period_id UUID REFERENCES public.session_periods(id);
