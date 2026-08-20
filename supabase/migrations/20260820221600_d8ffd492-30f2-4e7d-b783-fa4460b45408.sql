ALTER TABLE public.reminder_logs
  ADD COLUMN IF NOT EXISTS membership_occurrence_id uuid
    REFERENCES public.membership_occurrences(id) ON DELETE SET NULL;