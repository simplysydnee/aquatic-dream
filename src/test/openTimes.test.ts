import { describe, expect, it } from "vitest";
import { computeOpenTimes } from "@/lib/openTimes";
import type { OpeningSlot } from "@/hooks/useSlotOpenings";

const slot = (over: Partial<OpeningSlot> & { id: string }): OpeningSlot => ({
  plan_key: "private",
  instructor_id: "coach-1",
  day_of_week: 1,
  start_time: "16:00:00",
  end_time: "16:30:00",
  capacity: 1,
  active: true,
  swim_level: null,
  accepted_levels: null,
  ...over,
});

describe("computeOpenTimes", () => {
  it("hides a capacity 1 private time once a hold takes it", () => {
    const slots = [slot({ id: "mon-4" }), slot({ id: "mon-430", start_time: "16:30:00" })];

    const before = computeOpenTimes(slots, {}, "private");
    expect(before[0].times.map((t) => t.start)).toEqual(["16:00:00", "16:30:00"]);

    // swimmer A's draft hold now occupies mon-4
    const after = computeOpenTimes(slots, { "mon-4": 1 }, "private");
    expect(after[0].times.map((t) => t.start)).toEqual(["16:30:00"]);
  });

  it("keeps the time when another coach is still free at 4:00", () => {
    const slots = [slot({ id: "mon-4-a" }), slot({ id: "mon-4-b", instructor_id: "coach-2" })];
    const after = computeOpenTimes(slots, { "mon-4-a": 1 }, "private");
    expect(after[0].times[0].count).toBe(1);
    expect(after[0].times[0].openSlots.map((s) => s.id)).toEqual(["mon-4-b"]);
  });

  it("counts remaining seats for group classes", () => {
    const slots = [slot({ id: "g1", plan_key: "kid_group", capacity: 4 })];
    expect(computeOpenTimes(slots, { g1: 3 }, "kid_group")[0].times[0].count).toBe(1);
    expect(computeOpenTimes(slots, { g1: 4 }, "kid_group")).toEqual([]);
  });
});
