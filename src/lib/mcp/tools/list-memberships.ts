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
  name: "list_memberships",
  title: "List memberships",
  description:
    "List memberships with swimmer, plan, standing-slot (day/time/level), status, billing period, and parent contact. Optional filters: status, plan_key, and a name/email query.",
  inputSchema: {
    status: z
      .enum(["active", "past_due", "canceled", "paused", "pending"])
      .optional(),
    plan_key: z.enum(["kid_group", "private", "adult_group"]).optional(),
    query: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Optional fragment matched against swimmer name, parent name, or parent email."),
    limit: z.number().int().min(1).max(200).default(100),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, plan_key, query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = client(ctx);
    let q = supabase
      .from("memberships")
      .select(
        `id, plan_key, status, start_date,
         child_first_name, child_last_name,
         parent_first_name, parent_last_name, parent_email, parent_phone,
         stripe_subscription_id, current_period_start, current_period_end,
         standing_slot_id,
         standing_slots(day_of_week, start_time, end_time, swim_level, instructors(name))`,
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    if (plan_key) q = q.eq("plan_key", plan_key);
    if (query) {
      const like = `%${query}%`;
      q = q.or(
        `child_first_name.ilike.${like},child_last_name.ilike.${like},parent_first_name.ilike.${like},parent_last_name.ilike.${like},parent_email.ilike.${like}`,
      );
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const ids = (data ?? []).map((m: any) => m.id);
    const firstDates = new Map<string, string>();
    if (ids.length) {
      const { data: occs } = await supabase
        .from("membership_occurrences")
        .select("membership_id, occurrence_date")
        .in("membership_id", ids)
        .order("occurrence_date", { ascending: true });
      for (const o of (occs as any[]) ?? []) {
        if (!firstDates.has(o.membership_id)) firstDates.set(o.membership_id, o.occurrence_date);
      }
    }

    const rows = (data ?? []).map((m: any) => {
      const slot = m.standing_slots;
      const swimmer = [m.child_first_name, m.child_last_name].filter(Boolean).join(" ").trim();
      const parent = [m.parent_first_name, m.parent_last_name].filter(Boolean).join(" ").trim();
      return {
        id: m.id,
        swimmer_name: swimmer || null,
        plan_key: m.plan_key,
        program: m.membership_plans?.name ?? null,
        slot: slot
          ? {
              day_of_week: slot.day_of_week,
              day_name: DAY_NAMES[slot.day_of_week] ?? null,
              start_time: slot.start_time,
              end_time: slot.end_time,
              swim_level: slot.swim_level,
              instructor_name: slot.instructors?.name ?? null,
            }
          : null,
        status: m.status,
        start_date: m.start_date,
        first_lesson_date: firstDates.get(m.id) ?? null,
        monthly_price_cents: m.membership_plans?.monthly_price_cents ?? null,
        stripe_subscription_id: m.stripe_subscription_id,
        current_period_start: m.current_period_start,
        current_period_end: m.current_period_end,
        next_charge_date: m.current_period_end,
        parent_name: parent || null,
        parent_email: m.parent_email,
        parent_phone: m.parent_phone,
      };
    });

    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { rows },
    };
  },
});
