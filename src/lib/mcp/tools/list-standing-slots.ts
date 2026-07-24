import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default defineTool({
  name: "list_standing_slots",
  title: "List standing membership slots",
  description:
    "List weekly membership standing slots with capacity, enrolled count, and spots left. Optional filters: program (kid_group/private/adult_group), swim level (white/red/yellow/blue/green), and day of week (0=Sunday..6=Saturday).",
  inputSchema: {
    program: z.enum(["kid_group", "private", "adult_group"]).optional(),
    level: z.enum(["white", "red", "yellow", "blue", "green"]).optional(),
    day: z.number().int().min(0).max(6).optional().describe("0=Sunday..6=Saturday"),
    activeOnly: z.boolean().default(true),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ program, level, day, activeOnly }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = client(ctx);

    let q = supabase
      .from("standing_slots")
      .select(
        "id, plan_key, swim_level, day_of_week, start_time, end_time, capacity, location, active, instructor_id, instructors(name), membership_plans!inner(name)",
      );
    if (activeOnly) q = q.eq("active", true);
    if (program) q = q.eq("plan_key", program);
    if (level) q = q.eq("swim_level", level);
    if (typeof day === "number") q = q.eq("day_of_week", day);
    const { data: slots, error } = await q.order("day_of_week").order("start_time");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const slotIds = (slots ?? []).map((s: any) => s.id);
    const counts = new Map<string, number>();
    if (slotIds.length) {
      const { data: mems } = await supabase
        .from("memberships")
        .select("standing_slot_id")
        .in("standing_slot_id", slotIds)
        .eq("status", "active");
      for (const m of (mems as any[]) ?? []) {
        counts.set(m.standing_slot_id, (counts.get(m.standing_slot_id) ?? 0) + 1);
      }
    }

    const rows = (slots ?? []).map((s: any) => {
      const enrolled = counts.get(s.id) ?? 0;
      return {
        id: s.id,
        plan_key: s.plan_key,
        program_name: s.membership_plans?.name ?? null,
        swim_level: s.swim_level,
        instructor_name: s.instructors?.name ?? null,
        day_of_week: s.day_of_week,
        day_name: DAY_NAMES[s.day_of_week] ?? null,
        start_time: s.start_time,
        end_time: s.end_time,
        capacity: s.capacity,
        enrolled_count: enrolled,
        spots_left: Math.max(0, s.capacity - enrolled),
        active: s.active,
      };
    });

    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { rows },
    };
  },
});
