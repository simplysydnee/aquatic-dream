import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OpeningPlanKey = "kid_group" | "private" | "adult_group";
export type OpeningSwimLevel = "white" | "red" | "yellow" | "blue" | "green";

export interface OpeningSlot {
  id: string;
  plan_key: OpeningPlanKey;
  instructor_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  capacity: number;
  active: boolean;
  swim_level: OpeningSwimLevel | null;
  accepted_levels: string[] | null;
}

export interface OpeningPlan {
  plan_key: OpeningPlanKey;
  name: string;
  monthly_price_cents: number | null;
}

/**
 * Live openings for standing slots, using the same occupancy rule the
 * standing-slots chips and get-open-slots apply: memberships in active,
 * pending_cancel or paused, plus live phone holds, count against capacity.
 */
export function useSlotOpenings() {
  const [slots, setSlots] = useState<OpeningSlot[]>([]);
  const [occupancy, setOccupancy] = useState<Record<string, number>>({});
  const [instructorNames, setInstructorNames] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<OpeningPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [slotRes, occRes, holdRes, instRes, planRes] = await Promise.all([
      supabase
        .from("standing_slots")
        .select(
          "id, plan_key, instructor_id, day_of_week, start_time, end_time, capacity, active, swim_level, accepted_levels",
        ),
      supabase
        .from("memberships")
        .select("standing_slot_id")
        .in("status", ["active", "pending_cancel", "paused"]),
      supabase
        .from("membership_holds")
        .select("standing_slot_id")
        .eq("status", "held")
        .gt("held_until", new Date().toISOString()),
      supabase.rpc("get_instructors_admin"),
      supabase
        .from("membership_plans")
        .select("plan_key, name, monthly_price_cents")
        .eq("active", true),
    ]);

    setSlots(((slotRes.data as unknown as OpeningSlot[]) || []).filter((s) => s.active));

    const occ: Record<string, number> = {};
    for (const row of (occRes.data as { standing_slot_id: string | null }[] | null) || []) {
      if (!row.standing_slot_id) continue;
      occ[row.standing_slot_id] = (occ[row.standing_slot_id] || 0) + 1;
    }
    for (const row of (holdRes.data as { standing_slot_id: string | null }[] | null) || []) {
      if (!row.standing_slot_id) continue;
      occ[row.standing_slot_id] = (occ[row.standing_slot_id] || 0) + 1;
    }
    setOccupancy(occ);

    const names: Record<string, string> = {};
    for (const i of (instRes.data as { id: string; name: string }[] | null) || []) {
      names[i.id] = i.name;
    }
    setInstructorNames(names);
    setPlans((planRes.data as unknown as OpeningPlan[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { slots, occupancy, instructorNames, plans, loading, refresh };
}
