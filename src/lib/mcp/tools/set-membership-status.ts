import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { adminClient, errResult, notAuthed, okResult, refuseUnconfirmed } from "./_client";

export default defineTool({
  name: "set_membership_status",
  title: "Pause or resume membership",
  description:
    "Set a membership's status to 'paused' or 'active'. Use cancel_membership to cancel. Requires confirm=true.",
  inputSchema: {
    id: z.string().uuid(),
    status: z.enum(["paused", "active"]),
    confirm: z.boolean().default(false),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ id, status, confirm }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    if (!confirm) return refuseUnconfirmed(`Would set membership ${id} status to ${status}.`, { id, status });
    const supabase = adminClient(ctx);
    const { data, error } = await supabase
      .from("memberships")
      .update({ status })
      .eq("id", id)
      .select("id, status")
      .maybeSingle();
    if (error) return errResult(error.message);
    if (!data) return errResult("Membership not found");
    return okResult(data);
  },
});
