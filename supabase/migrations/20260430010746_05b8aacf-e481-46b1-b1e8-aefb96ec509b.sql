-- swim_enrollments
ALTER TABLE public.swim_enrollments
  ADD COLUMN child_first_name text,
  ADD COLUMN child_last_name text,
  ADD COLUMN parent_first_name text,
  ADD COLUMN parent_last_name text;

UPDATE public.swim_enrollments
   SET child_first_name = NULLIF(trim(child_name), ''),
       parent_first_name = NULLIF(trim(parent_name), '')
 WHERE child_first_name IS NULL OR parent_first_name IS NULL;

-- lesson_requests
ALTER TABLE public.lesson_requests
  ADD COLUMN child_first_name text,
  ADD COLUMN child_last_name text,
  ADD COLUMN parent_first_name text,
  ADD COLUMN parent_last_name text;

UPDATE public.lesson_requests
   SET child_first_name = NULLIF(trim(child_name), ''),
       parent_first_name = NULLIF(trim(parent_name), '')
 WHERE child_first_name IS NULL OR parent_first_name IS NULL;

-- lesson_bookings
ALTER TABLE public.lesson_bookings
  ADD COLUMN child_first_name text,
  ADD COLUMN child_last_name text,
  ADD COLUMN parent_first_name text,
  ADD COLUMN parent_last_name text;

UPDATE public.lesson_bookings
   SET child_first_name = NULLIF(trim(child_name), ''),
       parent_first_name = NULLIF(trim(parent_name), '')
 WHERE child_first_name IS NULL OR parent_first_name IS NULL;

-- pool_events
ALTER TABLE public.pool_events
  ADD COLUMN client_first_name text,
  ADD COLUMN client_last_name text;

UPDATE public.pool_events
   SET client_first_name = NULLIF(trim(client_name), '')
 WHERE client_first_name IS NULL AND client_name IS NOT NULL;

-- enrollment_agreements
ALTER TABLE public.enrollment_agreements
  ADD COLUMN signer_first_name text,
  ADD COLUMN signer_last_name text,
  ADD COLUMN emergency_contact_first_name text,
  ADD COLUMN emergency_contact_last_name text;

UPDATE public.enrollment_agreements
   SET signer_first_name = NULLIF(trim(signer_name), ''),
       emergency_contact_first_name = NULLIF(trim(emergency_contact_name), '')
 WHERE signer_first_name IS NULL OR emergency_contact_first_name IS NULL;