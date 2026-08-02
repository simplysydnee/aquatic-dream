DELETE FROM public.membership_occurrences o
USING (
  SELECT id, row_number() OVER (PARTITION BY membership_id, occurrence_date ORDER BY created_at, id) AS rn
  FROM public.membership_occurrences
) d
WHERE o.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS membership_occurrences_membership_date_uniq
  ON public.membership_occurrences (membership_id, occurrence_date);