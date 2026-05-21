
-- =========================================================
-- MARKETING CONTACTS
-- =========================================================
CREATE TABLE public.marketing_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  source TEXT NOT NULL DEFAULT 'manual', -- swim | lessons | scuba | inquiry | import | manual
  tags TEXT[] NOT NULL DEFAULT '{}',
  subscribed BOOLEAN NOT NULL DEFAULT true,
  unsubscribed_at TIMESTAMPTZ,
  unsubscribe_reason TEXT,
  last_sent_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketing_contacts_email_lower ON public.marketing_contacts (lower(email));
CREATE INDEX idx_marketing_contacts_subscribed ON public.marketing_contacts (subscribed) WHERE subscribed = true;
CREATE INDEX idx_marketing_contacts_tags ON public.marketing_contacts USING GIN (tags);

ALTER TABLE public.marketing_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage marketing contacts"
ON public.marketing_contacts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages marketing contacts"
ON public.marketing_contacts FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_marketing_contacts_updated
BEFORE UPDATE ON public.marketing_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- MARKETING CAMPAIGNS
-- =========================================================
CREATE TABLE public.marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  preheader TEXT,
  from_address TEXT,
  reply_to TEXT,
  body_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  body_html TEXT,
  audience JSONB NOT NULL DEFAULT '{"tags":[],"sources":[],"include_all":true}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | scheduled | sending | sent | failed | cancelled
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  opened_count INTEGER NOT NULL DEFAULT 0,
  clicked_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketing_campaigns_status ON public.marketing_campaigns (status);
CREATE INDEX idx_marketing_campaigns_scheduled ON public.marketing_campaigns (scheduled_for) WHERE status = 'scheduled';

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage marketing campaigns"
ON public.marketing_campaigns FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages marketing campaigns"
ON public.marketing_campaigns FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_marketing_campaigns_updated
BEFORE UPDATE ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- MARKETING CAMPAIGN RECIPIENTS (delivery ledger)
-- =========================================================
CREATE TABLE public.marketing_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | sent | failed | bounced | complained | opened | clicked
  resend_message_id TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_recipients_campaign ON public.marketing_campaign_recipients (campaign_id);
CREATE INDEX idx_campaign_recipients_message_id ON public.marketing_campaign_recipients (resend_message_id);
CREATE INDEX idx_campaign_recipients_email ON public.marketing_campaign_recipients (lower(email));

ALTER TABLE public.marketing_campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view recipients"
ON public.marketing_campaign_recipients FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages recipients"
ON public.marketing_campaign_recipients FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- =========================================================
-- UNSUBSCRIBE TOKENS
-- =========================================================
CREATE TABLE public.marketing_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketing_unsub_token ON public.marketing_unsubscribe_tokens (token);

ALTER TABLE public.marketing_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages unsub tokens"
ON public.marketing_unsubscribe_tokens FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins view unsub tokens"
ON public.marketing_unsubscribe_tokens FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- HELPERS
-- =========================================================

-- Get or create a stable unsubscribe token for an email
CREATE OR REPLACE FUNCTION public.get_or_create_unsubscribe_token(_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _token TEXT;
  _normalized TEXT;
BEGIN
  _normalized := lower(trim(_email));
  SELECT token INTO _token FROM public.marketing_unsubscribe_tokens WHERE lower(email) = _normalized LIMIT 1;
  IF _token IS NOT NULL THEN RETURN _token; END IF;

  _token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.marketing_unsubscribe_tokens (email, token)
  VALUES (_normalized, _token)
  ON CONFLICT (email) DO UPDATE SET token = EXCLUDED.token
  RETURNING token INTO _token;

  RETURN _token;
END;
$$;

-- Public unsubscribe via token
CREATE OR REPLACE FUNCTION public.unsubscribe_marketing_by_token(_token TEXT, _reason TEXT DEFAULT NULL)
RETURNS TABLE(email TEXT, already BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email TEXT;
  _already BOOLEAN := false;
BEGIN
  SELECT t.email INTO _email FROM public.marketing_unsubscribe_tokens t WHERE t.token = _token LIMIT 1;
  IF _email IS NULL THEN
    RAISE EXCEPTION 'Invalid unsubscribe token';
  END IF;

  SELECT (c.subscribed = false) INTO _already FROM public.marketing_contacts c WHERE lower(c.email) = lower(_email) LIMIT 1;

  UPDATE public.marketing_contacts
     SET subscribed = false,
         unsubscribed_at = COALESCE(unsubscribed_at, now()),
         unsubscribe_reason = COALESCE(_reason, unsubscribe_reason),
         updated_at = now()
   WHERE lower(email) = lower(_email);

  RETURN QUERY SELECT _email, COALESCE(_already, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unsubscribe_marketing_by_token(TEXT, TEXT) TO anon, authenticated;

-- Lookup email for token (so we can show "you're unsubscribing X" on the page)
CREATE OR REPLACE FUNCTION public.get_email_by_unsubscribe_token(_token TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.marketing_unsubscribe_tokens WHERE token = _token LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_unsubscribe_token(TEXT) TO anon, authenticated;

-- =========================================================
-- AUTO-SYNC: upsert helper
-- =========================================================
CREATE OR REPLACE FUNCTION public.upsert_marketing_contact(
  _email TEXT,
  _first_name TEXT,
  _last_name TEXT,
  _phone TEXT,
  _source TEXT,
  _tags TEXT[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized TEXT;
BEGIN
  IF _email IS NULL OR trim(_email) = '' THEN RETURN; END IF;
  _normalized := lower(trim(_email));

  INSERT INTO public.marketing_contacts (email, first_name, last_name, phone, source, tags)
  VALUES (_normalized, _first_name, _last_name, _phone, _source, COALESCE(_tags, '{}'))
  ON CONFLICT (email) DO UPDATE
    SET first_name = COALESCE(EXCLUDED.first_name, public.marketing_contacts.first_name),
        last_name  = COALESCE(EXCLUDED.last_name,  public.marketing_contacts.last_name),
        phone      = COALESCE(EXCLUDED.phone,      public.marketing_contacts.phone),
        tags       = ARRAY(
                       SELECT DISTINCT unnest(public.marketing_contacts.tags || COALESCE(EXCLUDED.tags, '{}'))
                     ),
        updated_at = now();
END;
$$;

-- =========================================================
-- AUTO-SYNC TRIGGERS
-- =========================================================
CREATE OR REPLACE FUNCTION public.sync_marketing_from_swim_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tags TEXT[];
BEGIN
  _tags := ARRAY['swim'];
  IF NEW.swim_level IS NOT NULL THEN
    _tags := _tags || ('level:' || lower(NEW.swim_level));
  END IF;
  PERFORM public.upsert_marketing_contact(
    NEW.parent_email,
    COALESCE(NEW.parent_first_name, split_part(NEW.parent_name, ' ', 1)),
    COALESCE(NEW.parent_last_name, NULLIF(substring(NEW.parent_name from position(' ' in NEW.parent_name) + 1), '')),
    NEW.parent_phone,
    'swim',
    _tags
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_marketing_swim
AFTER INSERT ON public.swim_enrollments
FOR EACH ROW EXECUTE FUNCTION public.sync_marketing_from_swim_enrollment();

CREATE OR REPLACE FUNCTION public.sync_marketing_from_lesson_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.upsert_marketing_contact(
    NEW.parent_email,
    COALESCE(NEW.parent_first_name, split_part(NEW.parent_name, ' ', 1)),
    COALESCE(NEW.parent_last_name, NULLIF(substring(NEW.parent_name from position(' ' in NEW.parent_name) + 1), '')),
    NEW.parent_phone,
    'lessons',
    ARRAY['private-lessons']
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_marketing_lessons
AFTER INSERT ON public.lesson_bookings
FOR EACH ROW EXECUTE FUNCTION public.sync_marketing_from_lesson_booking();

CREATE OR REPLACE FUNCTION public.sync_marketing_from_dive_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.upsert_marketing_contact(
    NEW.email,
    split_part(NEW.full_name, ' ', 1),
    NULLIF(substring(NEW.full_name from position(' ' in NEW.full_name) + 1), ''),
    NEW.phone,
    'scuba',
    ARRAY['scuba']
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_marketing_dive
AFTER INSERT ON public.dive_bookings
FOR EACH ROW EXECUTE FUNCTION public.sync_marketing_from_dive_booking();

CREATE OR REPLACE FUNCTION public.sync_marketing_from_contact_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.upsert_marketing_contact(
    NEW.email,
    split_part(NEW.full_name, ' ', 1),
    NULLIF(substring(NEW.full_name from position(' ' in NEW.full_name) + 1), ''),
    NEW.phone,
    'inquiry',
    ARRAY['inquiry']
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_marketing_contact
AFTER INSERT ON public.contact_submissions
FOR EACH ROW EXECUTE FUNCTION public.sync_marketing_from_contact_submission();

-- =========================================================
-- BACKFILL existing contacts
-- =========================================================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT ON (lower(parent_email))
              parent_email, parent_first_name, parent_last_name, parent_name, parent_phone, swim_level
           FROM public.swim_enrollments
           WHERE parent_email IS NOT NULL AND parent_email <> ''
           ORDER BY lower(parent_email), created_at DESC
  LOOP
    PERFORM public.upsert_marketing_contact(
      r.parent_email,
      COALESCE(r.parent_first_name, split_part(r.parent_name, ' ', 1)),
      COALESCE(r.parent_last_name, NULLIF(substring(r.parent_name from position(' ' in r.parent_name) + 1), '')),
      r.parent_phone,
      'swim',
      CASE WHEN r.swim_level IS NOT NULL
           THEN ARRAY['swim', 'level:' || lower(r.swim_level)]
           ELSE ARRAY['swim'] END
    );
  END LOOP;

  FOR r IN SELECT DISTINCT ON (lower(parent_email))
              parent_email, parent_first_name, parent_last_name, parent_name, parent_phone
           FROM public.lesson_bookings
           WHERE parent_email IS NOT NULL AND parent_email <> ''
           ORDER BY lower(parent_email), created_at DESC
  LOOP
    PERFORM public.upsert_marketing_contact(
      r.parent_email,
      COALESCE(r.parent_first_name, split_part(r.parent_name, ' ', 1)),
      COALESCE(r.parent_last_name, NULLIF(substring(r.parent_name from position(' ' in r.parent_name) + 1), '')),
      r.parent_phone,
      'lessons',
      ARRAY['private-lessons']
    );
  END LOOP;

  FOR r IN SELECT DISTINCT ON (lower(email)) email, full_name, phone
           FROM public.dive_bookings
           WHERE email IS NOT NULL AND email <> ''
           ORDER BY lower(email), created_at DESC
  LOOP
    PERFORM public.upsert_marketing_contact(
      r.email,
      split_part(r.full_name, ' ', 1),
      NULLIF(substring(r.full_name from position(' ' in r.full_name) + 1), ''),
      r.phone,
      'scuba',
      ARRAY['scuba']
    );
  END LOOP;

  FOR r IN SELECT DISTINCT ON (lower(email)) email, full_name, phone
           FROM public.contact_submissions
           WHERE email IS NOT NULL AND email <> ''
           ORDER BY lower(email), created_at DESC
  LOOP
    PERFORM public.upsert_marketing_contact(
      r.email,
      split_part(r.full_name, ' ', 1),
      NULLIF(substring(r.full_name from position(' ' in r.full_name) + 1), ''),
      r.phone,
      'inquiry',
      ARRAY['inquiry']
    );
  END LOOP;
END $$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.marketing_contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.marketing_campaigns;
