ALTER TABLE public.pool_events
  DROP CONSTRAINT IF EXISTS pool_events_event_type_check;

ALTER TABLE public.pool_events
  ADD CONSTRAINT pool_events_event_type_check
  CHECK (event_type IN (
    'i-can-swim',
    'dive-session',
    'pool-rental',
    'maintenance',
    'other',
    'private-lesson',
    'semi-private-lesson',
    'swim-lesson'
  ));