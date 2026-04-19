-- Staging table for enrollment data while Stripe checkout is in progress.
-- Real enrollments are only written to swim_enrollments after the webhook fires.
create table public.pending_enrollments (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  customer_email text not null,
  created_at timestamptz not null default now()
);

create index idx_pending_enrollments_created_at on public.pending_enrollments(created_at);

alter table public.pending_enrollments enable row level security;

-- Service role only — no public, anon, or authenticated access.
create policy "Service role can manage pending enrollments"
  on public.pending_enrollments
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Enable extensions for scheduled cleanup
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Hourly cleanup of pending rows older than 24 hours, regardless of webhook outcome.
select cron.schedule(
  'cleanup-pending-enrollments',
  '0 * * * *',
  $$ delete from public.pending_enrollments where created_at < now() - interval '24 hours' $$
);