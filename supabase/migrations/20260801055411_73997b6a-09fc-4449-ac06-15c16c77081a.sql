DELETE FROM public.lesson_booking_occurrences WHERE booking_id = '4cc22322-3568-43bc-ab60-72f25acbf449';
DELETE FROM public.lesson_bookings WHERE id = '4cc22322-3568-43bc-ab60-72f25acbf449';
DELETE FROM public.marketing_contacts WHERE email ILIKE 'zztest.qa%';