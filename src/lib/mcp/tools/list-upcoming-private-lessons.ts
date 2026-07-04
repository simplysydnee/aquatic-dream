import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_upcoming_private_lessons",
  title: "List upcoming private lessons",
  description:
    "Return private lesson occurrences on or after the given start date (default today), up to the given number of days ahead. Includes swimmer, instructor, time, payment status, and charge status.",
  inputSchema: {
    fromDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("ISO date (YYYY-MM-DD). Defaults to today."),
    daysAhead: z.number().int().min(1).max(60).default(14),
    limit: z.number().int().min(1).max(200).default(100),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ fromDate, daysAhead, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = client(ctx);
    const start = fromDate ?? new Date().toISOString().slice(0, 10);
    const endDate = new Date(start + "T00:00:00Z");
    endDate.setUTCDate(endDate.getUTCDate() + daysAhead);
    const end = endDate.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("lesson_booking_occurrences")
      .select(
        `id, occurrence_date, start_time_override, end_time_override, status, payment_status, charge_status,
         instructor_override_name,
         booking:lesson_bookings!inner(id, child_name, parent_name, parent_email, instructor_name, start_time, end_time, lesson_type, status)`,
      )
      .gte("occurrence_date", start)
      .lt("occurrence_date", end)
      .neq("status", "cancelled")
      .order("occurrence_date", { ascending: true })
      .limit(limit);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
