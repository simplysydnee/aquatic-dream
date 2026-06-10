
-- Backfill swim_enrollments.waiver_signed_at from enrollment_agreements
UPDATE public.swim_enrollments se
   SET waiver_signed_at = sub.signed_at,
       updated_at = now()
  FROM (
    SELECT enrollment_id, MAX(signed_at) AS signed_at
      FROM public.enrollment_agreements
     WHERE waiver_accepted = true
       AND signed_at IS NOT NULL
     GROUP BY enrollment_id
  ) sub
 WHERE se.id = sub.enrollment_id
   AND se.waiver_signed_at IS NULL;

-- Trigger to keep swim_enrollments.waiver_signed_at synced with enrollment_agreements
CREATE OR REPLACE FUNCTION public.sync_enrollment_waiver_signed_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.waiver_accepted = true AND NEW.signed_at IS NOT NULL AND NEW.enrollment_id IS NOT NULL THEN
    UPDATE public.swim_enrollments
       SET waiver_signed_at = GREATEST(COALESCE(waiver_signed_at, NEW.signed_at), NEW.signed_at),
           updated_at = now()
     WHERE id = NEW.enrollment_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_enrollment_waiver_signed_at ON public.enrollment_agreements;
CREATE TRIGGER trg_sync_enrollment_waiver_signed_at
AFTER INSERT OR UPDATE OF signed_at, waiver_accepted ON public.enrollment_agreements
FOR EACH ROW EXECUTE FUNCTION public.sync_enrollment_waiver_signed_at();
