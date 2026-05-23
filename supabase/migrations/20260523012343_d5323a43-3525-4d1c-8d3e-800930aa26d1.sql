-- Revoke EXECUTE from PUBLIC on all SECURITY DEFINER functions, then re-grant
-- only to roles that actually need them. Trigger functions and internal helpers
-- should never be callable through PostgREST.

-- ---- Trigger functions (only called by Postgres itself) ----
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_first_time_swimmer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_enrollment_waiver_token() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_marketing_from_lesson_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_marketing_from_dive_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_marketing_from_contact_submission() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_marketing_from_swim_enrollment() FROM PUBLIC, anon, authenticated;

-- ---- Internal helpers (only called from other SECURITY DEFINER fns / edge fns w/ service role) ----
REVOKE ALL ON FUNCTION public.upsert_marketing_contact(text, text, text, text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

-- ---- Genuinely public RPCs (waiver pages, unsubscribe links, capacity counts) ----
-- Tighten then grant back explicitly so the linter sees an intentional grant.
REVOKE ALL ON FUNCTION public.get_session_enrollment_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_enrollment_counts(uuid[]) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_swim_enrollment_by_waiver_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_swim_enrollment_by_waiver_token(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.mark_swim_enrollment_waiver_signed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_swim_enrollment_waiver_signed(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_lesson_booking_by_waiver_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lesson_booking_by_waiver_token(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_lesson_booking_summary_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lesson_booking_summary_by_token(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.mark_lesson_waiver_signed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_lesson_waiver_signed(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_email_by_unsubscribe_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_email_by_unsubscribe_token(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.unsubscribe_marketing_by_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_marketing_by_token(text, text) TO anon, authenticated;

-- get_or_create_unsubscribe_token is only used server-side by edge functions (service role).
REVOKE ALL ON FUNCTION public.get_or_create_unsubscribe_token(text) FROM PUBLIC, anon, authenticated;

-- ---- Auth/role helpers (used by RLS policies; must remain callable by signed-in users) ----
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.current_user_instructor_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_instructor_id() TO authenticated;

-- ---- Instructor self-service RPCs (signed-in instructors only) ----
REVOKE ALL ON FUNCTION public.claim_open_shift(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_open_shift(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.clock_in(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clock_in(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.clock_out(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clock_out(integer, text) TO authenticated;

-- ---- Admin RPC (has internal has_role check) ----
REVOKE ALL ON FUNCTION public.approve_shift_trade(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_shift_trade(uuid) TO authenticated;
