UPDATE public.lesson_booking_occurrences
SET status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, now()),
    updated_at = now()
WHERE id IN ('71100035-b857-41ee-bb92-5c519f0ee962','6df6a2a8-9ec7-4de6-b877-f83b065360b7','377e70b2-970b-44d9-99aa-60c78dbb9c2a');

UPDATE public.lesson_booking_occurrences
SET payment_status = 'paid',
    paid_at = COALESCE(paid_at, now()),
    payment_method = 'stripe',
    payment_reference = 'stripe_invoice',
    charge_status = 'succeeded',
    updated_at = now()
WHERE id IN ('64781cb2-0e7a-43d6-bc40-8b1e334928b2','bc9dbbea-690a-48f7-848c-2b1bd162baa0','f6783b30-592c-4c1f-bab4-1d7bfd48f8ec');