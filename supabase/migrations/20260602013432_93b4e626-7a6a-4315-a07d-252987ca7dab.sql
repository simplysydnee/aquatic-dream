ALTER TABLE public.lesson_requests ADD COLUMN IF NOT EXISTS is_adult_swimmer boolean NOT NULL DEFAULT false;

UPDATE public.lesson_requests
   SET is_adult_swimmer = true
 WHERE is_adult_swimmer = false
   AND (
     child_age >= 16
     OR lower(coalesce(notes,'')) ~ '(adult|myself|for me|i want lessons|i''m an adult|im an adult)'
     OR lower(coalesce(child_name,'')) ~ '(adult|myself)'
   );