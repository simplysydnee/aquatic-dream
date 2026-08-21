ALTER FUNCTION public.staff_pin_verify(uuid, text) SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.staff_pin_enroll(uuid, text, uuid, text) SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.staff_pin_change(uuid, text, text) SET search_path TO 'public', 'extensions';