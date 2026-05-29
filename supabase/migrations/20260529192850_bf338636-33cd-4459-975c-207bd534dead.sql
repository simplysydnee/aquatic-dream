ALTER TABLE public.lesson_bookings DROP CONSTRAINT IF EXISTS lesson_bookings_status_check;
ALTER TABLE public.lesson_bookings ADD CONSTRAINT lesson_bookings_status_check CHECK (status = ANY (ARRAY['active'::text, 'cancelled'::text, 'completed'::text, 'pending_card'::text]));

ALTER TABLE public.lesson_booking_occurrences DROP CONSTRAINT IF EXISTS lesson_booking_occurrences_payment_status_check;
ALTER TABLE public.lesson_booking_occurrences ADD CONSTRAINT lesson_booking_occurrences_payment_status_check CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'paid'::text, 'comp'::text, 'refunded'::text, 'flagged_no_pay'::text, 'card_on_file'::text]));