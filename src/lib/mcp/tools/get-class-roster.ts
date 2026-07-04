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
  name: "get_class_roster",
  title: "Get class roster",
  description:
    "Return all active enrollments for a given swim_sessions.id, including swimmer, parent contact, payment status, and waiver status.",
  inputSchema: {
    sessionId: z.string().uuid().describe("UUID of swim_sessions row."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ sessionId }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = client(ctx);
    const { data, error } = await supabase
      .from("swim_enrollments")
      .select(
        "id, child_name, child_age, swim_level, status, parent_name, parent_email, parent_phone, payment_status, session_fee_status, waiver_signed_at, medical_notes, notes",
      )
      .eq("session_id", sessionId)
      .neq("status", "cancelled")
      .order("child_last_name", { ascending: true });
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
