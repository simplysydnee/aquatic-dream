create or replace function public.get_lesson_booking_summary_by_token(_token text)
returns table (
  id uuid,
  parent_name text,
  parent_email text,
  child_name text,
  lesson_type text,
  waiver_signed_at timestamptz,
  instructor_name text,
  start_time time,
  end_time time,
  series_start date,
  series_end date,
  recurring boolean,
  next_occurrence_date date,
  next_payment_status text,
  next_checkout_url text
)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select * from public.lesson_bookings where waiver_token = _token limit 1
  ),
  nxt as (
    select o.occurrence_date, o.payment_status, o.stripe_checkout_url
      from public.lesson_booking_occurrences o
      join b on o.booking_id = b.id
     where o.payment_status <> 'paid'
     order by o.occurrence_date asc
     limit 1
  )
  select b.id, b.parent_name, b.parent_email, b.child_name,
         b.lesson_type, b.waiver_signed_at,
         b.instructor_name, b.start_time, b.end_time,
         b.series_start, b.series_end, b.recurring,
         nxt.occurrence_date, nxt.payment_status, nxt.stripe_checkout_url
    from b left join nxt on true;
$$;