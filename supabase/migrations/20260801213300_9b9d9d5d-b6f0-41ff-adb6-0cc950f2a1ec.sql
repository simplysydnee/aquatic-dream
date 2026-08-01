ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS stripe_session_id text;

UPDATE public.memberships SET stripe_session_id = 'cs_live_c11jf1cwsORpt1SnZ21aFX5LRInm8ka1960lrCF8UnJxPOgD0ruqeN11TL'
 WHERE id IN ('445d7734-8442-4bca-8e6d-5a4e69aef911','3072573b-7ce1-4f7b-a4ba-490627f38e0e');

UPDATE public.memberships SET stripe_session_id = 'cs_live_c1ZT7OizslJ5c3kDg13MXxsHlog9KKVKJRXJQ85evlWmqXx7Rp5t9R9n88'
 WHERE id IN ('9670a831-08f1-4ac2-b7c3-ec0009d02dc0','141f787c-d2b3-4720-b728-d12dd586557e');

UPDATE public.memberships SET stripe_session_id = 'cs_live_c11CtmvlUFNHp89Lgl9NEXzVt4Tkd2PLDMvRDpGtyAA5ikn6G1LjwuxtTH'
 WHERE id IN ('828440b1-da25-4f27-8063-1d3315a3f0d8','0e05b950-e4fd-4dc2-b606-4f5612d85dd3');