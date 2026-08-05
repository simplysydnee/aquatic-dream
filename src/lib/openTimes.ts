import type { OpeningPlanKey, OpeningSlot } from "@/hooks/useSlotOpenings";

export interface OpenTimeChip {
  start: string;
  openSlots: OpeningSlot[];
  count: number;
}

export interface OpenTimeDay {
  dow: number;
  times: OpenTimeChip[];
}

/**
 * Groups bookable slots into day rows of time chips.
 * A slot only appears while capacity minus occupancy is greater than zero, so a
 * capacity 1 private slot disappears the moment a membership or live hold takes it.
 */
export const computeOpenTimes = (
  slots: OpeningSlot[],
  occupancy: Record<string, number>,
  planChoice: OpeningPlanKey | null,
): OpenTimeDay[] => {
  if (!planChoice) return [];
  const openOf = (slot: OpeningSlot) => Math.max(0, slot.capacity - (occupancy[slot.id] ?? 0));
  const list = slots.filter((s) => s.plan_key === planChoice);
  const byDay = new Map<number, OpeningSlot[]>();
  for (const s of list) {
    const arr = byDay.get(s.day_of_week) ?? [];
    arr.push(s);
    byDay.set(s.day_of_week, arr);
  }
  return Array.from(byDay.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([dow, daySlots]) => {
      const byTime = new Map<string, OpeningSlot[]>();
      for (const s of daySlots) {
        const arr = byTime.get(s.start_time) ?? [];
        arr.push(s);
        byTime.set(s.start_time, arr);
      }
      const times = Array.from(byTime.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([start, group]) => {
          const openSlots = group.filter((s) => openOf(s) > 0);
          const count =
            planChoice === "private" ? openSlots.length : group.reduce((a, s) => a + openOf(s), 0);
          return { start, openSlots, count };
        })
        .filter((t) => t.count > 0);
      return { dow, times };
    })
    .filter((d) => d.times.length > 0);
};
