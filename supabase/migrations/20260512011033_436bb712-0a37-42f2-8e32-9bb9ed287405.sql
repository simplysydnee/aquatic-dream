UPDATE public.lesson_booking_occurrences
SET payment_status = 'unpaid',
    paid_at = NULL,
    stripe_session_id = NULL,
    payment_method = NULL,
    payment_reference = NULL,
    payment_link_sent_at = NULL
WHERE booking_id = 'e50aa425-8ba4-4955-a5ff-ad3ec69fed97'
  AND id IN (
    'ae66447f-4bb3-4016-b08d-6eb4cf1ea974',
    '7651f998-9cc1-4c71-a01e-321ba97bd354'
  );