# Keep swim_level in sync with the level lock

## Problem confirmed

`standing_slots.swim_level` is stale seed data. The lock triggers only write `accepted_levels`, so the two fields drift.

Verified in the database right now (all 12 kid_group slots, all Monday, capacity 3):

| id | time | swim_level | accepted_levels | occupants |
|---|---|---|---|---|
| e2d825e1 | 4:00 PM | white | NULL | 0 |
| 79039baa | 4:00 PM | red | {red} | 1 |
| 3c7ac5c2 | 4:30 PM | red | {yellow} | 1 |
| b73757c1 | 4:30 PM | blue | {blue,green} | 3 |
| 046769b4 | 5:00 PM | white | {white} | 1 |
| bd34a699 | 5:00 PM | blue | {blue,green} | 3 |
| 4241c649 | 5:30 PM | yellow | NULL | 0 |
| aae7c3ab | 5:30 PM | red | NULL | 0 |
| 83c18cfa | 6:00 PM | red | NULL | 0 |
| dbcd3032 | 6:00 PM | white | NULL | 0 |
| 71379f21 | 6:30 PM | yellow | {yellow} | 1 |
| 778fde91 | 6:30 PM | blue | {blue,green} | 3 |

- Slot `3c7ac5c2` (4:30 PM): `swim_level = red` but `accepted_levels = ['yellow']` — its only occupant is yellow, so every admin screen reading `swim_level` shows the wrong level.
- FIVE empty slots carry a leftover `swim_level` while `accepted_levels` is NULL: 4:00 PM white, 5:30 PM yellow, 5:30 PM red, 6:00 PM red, 6:00 PM white.


## What changes

1. The lock trigger writes `swim_level` alongside `accepted_levels` when the first swimmer locks an empty group slot.
2. The unlock trigger clears `swim_level` when it clears `accepted_levels`.
3. A one-time backfill repairs today's 12 kid_group slots.

Nothing about booking, capacity, filtering, parent-facing `/join`, the assessment, RLS, or `get-open-slots` changes. `get-open-slots` already filters on `accepted_levels` only.

## Known limitation (accepted, not solved)

A blue/green slot accepts both levels but `swim_level` holds one value. It shows whichever level locked the slot first. That is fine for display.

## Exact SQL

```sql
-- 1. Lock trigger also sets swim_level
CREATE OR REPLACE FUNCTION public.lock_slot_level_on_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  slot_row public.standing_slots%ROWTYPE;
  occupying_count integer;
BEGIN
  IF NEW.plan_key IS DISTINCT FROM 'kid_group' OR NEW.standing_slot_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('active', 'pending_cancel', 'paused') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO slot_row FROM public.standing_slots
   WHERE id = NEW.standing_slot_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO occupying_count
    FROM public.memberships m
   WHERE m.standing_slot_id = NEW.standing_slot_id
     AND m.status IN ('active', 'pending_cancel', 'paused')
     AND m.id IS DISTINCT FROM NEW.id;

  IF occupying_count = 0 THEN
    IF NEW.swim_level IS NOT NULL THEN
      UPDATE public.standing_slots
         SET accepted_levels = CASE NEW.swim_level
                                 WHEN 'white' THEN ARRAY['white']
                                 WHEN 'red' THEN ARRAY['red']
                                 WHEN 'yellow' THEN ARRAY['yellow']
                                 WHEN 'blue' THEN ARRAY['blue','green']
                                 WHEN 'green' THEN ARRAY['blue','green']
                                 ELSE ARRAY[NEW.swim_level]
                               END,
             swim_level = NEW.swim_level
       WHERE id = NEW.standing_slot_id;
    END IF;
  ELSIF slot_row.accepted_levels IS NOT NULL
        AND array_length(slot_row.accepted_levels, 1) > 0
        AND NOT (NEW.swim_level = ANY (slot_row.accepted_levels)) THEN
    RAISE EXCEPTION 'MEMBERSHIP_LEVEL_MISMATCH: this class is set to a different swim group';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Unlock trigger also clears swim_level
CREATE OR REPLACE FUNCTION public.unlock_slot_level_when_empty()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_slot uuid;
  occupying_count integer;
BEGIN
  target_slot := OLD.standing_slot_id;
  IF OLD.plan_key IS DISTINCT FROM 'kid_group' OR target_slot IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NOT (OLD.status IN ('active', 'pending_cancel', 'paused')) THEN
      RETURN NULL;
    END IF;
    IF NEW.status IN ('active', 'pending_cancel', 'paused')
       AND NEW.standing_slot_id = target_slot THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT count(*) INTO occupying_count
    FROM public.memberships m
   WHERE m.standing_slot_id = target_slot
     AND m.status IN ('active', 'pending_cancel', 'paused');

  IF occupying_count = 0 THEN
    UPDATE public.standing_slots
       SET accepted_levels = NULL,
           swim_level = NULL
     WHERE id = target_slot;
  END IF;

  RETURN NULL;
END;
$function$;

-- 3a. Backfill: locked kid_group slots take the earliest occupant's level
UPDATE public.standing_slots s
   SET swim_level = first_member.swim_level
  FROM LATERAL (
    SELECT m.swim_level
      FROM public.memberships m
     WHERE m.standing_slot_id = s.id
       AND m.status IN ('active', 'pending_cancel', 'paused')
       AND m.swim_level IS NOT NULL
     ORDER BY m.created_at
     LIMIT 1
  ) AS first_member
 WHERE s.plan_key = 'kid_group'
   AND s.accepted_levels IS NOT NULL
   AND array_length(s.accepted_levels, 1) > 0
   AND s.swim_level IS DISTINCT FROM first_member.swim_level;

-- 3b. Backfill: unlocked kid_group slots have no level
UPDATE public.standing_slots
   SET swim_level = NULL
 WHERE plan_key = 'kid_group'
   AND (accepted_levels IS NULL OR array_length(accepted_levels, 1) = 0)
   AND swim_level IS NOT NULL;
```

Private and adult_group slots are untouched by every statement above.

## Expected result after the backfill

- `3c7ac5c2` (Mon 4:30 PM) becomes `swim_level = yellow`, matching its occupant and `accepted_levels`.
- The four empty Monday slots get `swim_level = NULL`, correctly reading as open to any level.
- The remaining locked slots already match and stay as they are.
