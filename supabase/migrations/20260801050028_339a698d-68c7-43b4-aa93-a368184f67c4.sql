CREATE UNIQUE INDEX IF NOT EXISTS marketing_contacts_email_uidx ON public.marketing_contacts (email);

CREATE OR REPLACE FUNCTION public.sync_marketing_from_contact_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(NEW.email));
  v_name text := trim(coalesce(NEW.full_name, ''));
  v_first text;
  v_last text;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN NEW;
  END IF;

  v_first := nullif(split_part(v_name, ' ', 1), '');
  v_last := nullif(trim(substring(v_name from position(' ' in v_name) + 1)), '');
  IF position(' ' in v_name) = 0 THEN
    v_last := NULL;
  END IF;

  INSERT INTO public.marketing_contacts (email, first_name, last_name, phone, source, tags, subscribed, notes)
  VALUES (
    v_email, v_first, v_last, nullif(trim(coalesce(NEW.phone, '')), ''),
    'contact_form', ARRAY['contact_form'], true,
    concat_ws(' — ', nullif(NEW.subject, ''), nullif(NEW.message, ''))
  )
  ON CONFLICT (email) DO UPDATE
  SET first_name = coalesce(public.marketing_contacts.first_name, EXCLUDED.first_name),
      last_name = coalesce(public.marketing_contacts.last_name, EXCLUDED.last_name),
      phone = coalesce(public.marketing_contacts.phone, EXCLUDED.phone),
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_marketing_from_contact_submission ON public.contact_submissions;
CREATE TRIGGER trg_sync_marketing_from_contact_submission
AFTER INSERT ON public.contact_submissions
FOR EACH ROW EXECUTE FUNCTION public.sync_marketing_from_contact_submission();

INSERT INTO public.marketing_contacts (email, first_name, last_name, phone, source, tags, subscribed, notes)
SELECT DISTINCT ON (lower(trim(cs.email)))
  lower(trim(cs.email)),
  nullif(split_part(trim(cs.full_name), ' ', 1), ''),
  CASE WHEN position(' ' in trim(cs.full_name)) = 0 THEN NULL
       ELSE nullif(trim(substring(trim(cs.full_name) from position(' ' in trim(cs.full_name)) + 1)), '') END,
  nullif(trim(coalesce(cs.phone, '')), ''),
  'contact_form',
  ARRAY['contact_form'],
  true,
  concat_ws(' — ', nullif(cs.subject, ''), nullif(cs.message, ''))
FROM public.contact_submissions cs
WHERE cs.email IS NOT NULL AND trim(cs.email) <> ''
ORDER BY lower(trim(cs.email)), cs.created_at DESC
ON CONFLICT (email) DO UPDATE
SET first_name = coalesce(public.marketing_contacts.first_name, EXCLUDED.first_name),
    last_name = coalesce(public.marketing_contacts.last_name, EXCLUDED.last_name),
    phone = coalesce(public.marketing_contacts.phone, EXCLUDED.phone),
    updated_at = now();