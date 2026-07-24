import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_membership",
  title: "Get membership detail",
  description:
    "Return the full membership record (swimmer, parent, plan, slot, consents, waiver_id) plus every scheduled membership_occurrence (date, time, instructor, status).",
  inputSchema: { id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = client(ctx);
    const { data: membership, error } = await supabase
      .from("memberships")
      .select(
        `*,
         standing_slots(day_of_week, start_time, end_time, swim_level, location, instructors(name))`,
      )
      .eq("id", id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!membership) return { content: [{ type: "text", text: "Membership not found" }], isError: true };

    const { data: plan } = await supabase
      .from("membership_plans")
      .select("plan_key, name, monthly_price_cents")
      .eq("plan_key", (membership as any).plan_key)
      .maybeSingle();
    (membership as any).membership_plans = plan
      ? { name: (plan as any).name, monthly_price_cents: (plan as any).monthly_price_cents }
      : null;

    const { data: occs, error: occErr } = await supabase
      .from("membership_occurrences")
      .select("id, occurrence_date, start_time, end_time, status, closure_type, cancel_reason, instructor_id, instructors:instructor_id(name)")
      .eq("membership_id", id)
      .order("occurrence_date", { ascending: true });
    if (occErr) return { content: [{ type: "text", text: occErr.message }], isError: true };

    const payload = {
      membership,
      occurrences: (occs ?? []).map((o: any) => ({
        id: o.id,
        date: o.occurrence_date,
        start_time: o.start_time,
        end_time: o.end_time,
        status: o.status,
        closure_type: o.closure_type,
        cancel_reason: o.cancel_reason,
        instructor_name: o.instructors?.name ?? null,
      })),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
