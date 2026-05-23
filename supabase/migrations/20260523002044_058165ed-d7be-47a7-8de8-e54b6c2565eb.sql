CREATE OR REPLACE FUNCTION public.get_session_enrollment_counts(_session_ids uuid[])
 RETURNS TABLE(session_id uuid, enrolled_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.session_id, COUNT(*)::int
    FROM public.swim_enrollments e
   WHERE e.session_id = ANY(_session_ids)
     AND e.status IN ('pending','confirmed','enrolled','pending_payment')
   GROUP BY e.session_id;
$function$;