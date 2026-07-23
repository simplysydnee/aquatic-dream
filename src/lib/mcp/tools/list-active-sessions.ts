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
  name: "list_active_sessions",
  title: "List active group sessions",
  description:
    "Return active group swim sessions with day, time, level, and enrollment counts vs capacity.",
  inputSchema: {
    swimLevel: z.string().optional().describe("Optional level filter (e.g. Pearls, Sharks)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ swimLevel }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = client(ctx);
    let q = supabase
      .from("swim_sessions")
      .select(
        "id, session_name, day_of_week, start_time, end_time, swim_level, max_students, registration_status, session_start_date, session_end_date, total_lessons, session_price",
      )
      .eq("is_active", true)
      .order("session_start_date", { ascending: true });
    if (swimLevel) q = q.eq("swim_level", swimLevel);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
