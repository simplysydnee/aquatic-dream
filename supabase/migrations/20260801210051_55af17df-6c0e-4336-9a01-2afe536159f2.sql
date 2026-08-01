UPDATE public.membership_occurrences o
SET status = 'cancelled'
FROM public.memberships m
WHERE o.membership_id = m.id
  AND m.id::text LIKE ANY (ARRAY['3072573b%','141f787c%','0e05b950%']);

UPDATE public.memberships
SET status = 'cancelled',
    stripe_subscription_id = NULL,
    notes = concat_ws(E'\n', nullif(notes,''),
      'Duplicate membership created 2026-08-01 by a checkout race (two callers, one pending row). Keeper membership: 445d7734. Cancelled subscription: sub_1TzfIF2HpbBBx5lse4xdLTot. Refunded invoice: in_1TzfIF2HpbBBx5ls3bvzAnfv ($80, refund re_3TzfIF2HpbBBx5ls1nQe953K).')
WHERE id::text LIKE '3072573b%';

UPDATE public.memberships
SET status = 'cancelled',
    stripe_subscription_id = NULL,
    notes = concat_ws(E'\n', nullif(notes,''),
      'Duplicate membership created 2026-08-01 by a checkout race (two callers, one pending row). Keeper membership: 9670a831. Cancelled subscription: sub_1Tzh2x2HpbBBx5lsWbHapqIn. Refunded invoice: in_1Tzh2x2HpbBBx5lssr2HFfoF ($80, refund re_3Tzh2y2HpbBBx5ls1ItwQ1kc).')
WHERE id::text LIKE '141f787c%';

UPDATE public.memberships
SET status = 'cancelled',
    stripe_subscription_id = NULL,
    notes = concat_ws(E'\n', nullif(notes,''),
      'Duplicate membership created 2026-08-01 by a checkout race (two callers, one pending row). Keeper membership: 828440b1. Cancelled subscription: sub_1TzhVC2HpbBBx5lscKoZdAjW. Refunded invoice: in_1TzhVC2HpbBBx5lsGhNVPNvY ($100, refund re_3TzhVC2HpbBBx5ls0i4U84LX).')
WHERE id::text LIKE '0e05b950%';