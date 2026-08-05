DELETE FROM public.membership_occurrences WHERE membership_id = '81e63b80-0cc1-423c-909c-5d60e6de2725';
DELETE FROM public.memberships WHERE id = '81e63b80-0cc1-423c-909c-5d60e6de2725';
DELETE FROM public.card_reuse_tokens WHERE parent_email = 'phase5.proof@example.com';
DELETE FROM public.pending_memberships WHERE payload->>'parent_email' = 'phase5.proof@example.com';
DELETE FROM public.standing_slots WHERE location = 'PHASE5 SANDBOX TEST - DELETE ME';