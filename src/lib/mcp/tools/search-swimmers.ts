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
  name: "search_swimmers",
  title: "Search swimmers",
  description:
    "Search enrolled swimmers by name (matches child first or last name). Returns swimmer name, parent name, email, swim level, and current status.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Name fragment to search for."),
    limit: z.number().int().min(1).max(50).default(20).describe("Max rows to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = client(ctx);
    const like = `%${query}%`;
    const { data, error } = await supabase
      .from("swim_enrollments")
      .select(
        "id, child_name, child_first_name, child_last_name, child_age, swim_level, status, parent_name, parent_email, parent_phone, session_id, created_at",
      )
      .or(
        `child_name.ilike.${like},child_first_name.ilike.${like},child_last_name.ilike.${like},parent_name.ilike.${like},parent_email.ilike.${like}`,
      )
      .order("created_at", { ascending: false })
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
