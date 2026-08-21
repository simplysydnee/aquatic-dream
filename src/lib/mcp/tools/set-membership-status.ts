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

    // Reversing a cancellation must put back exactly the future lessons that
    // cancellation closed.
    if (status === "active") {
      const { data: restored, error: revErr } = await supabase.rpc("reverse_membership_cancellation", {
        p_membership_id: id,
        p_cancellation_id: null,
      });
      if (revErr) {
        return errResult(`status set to active, but lessons were not restored: ${revErr.message}`);
      }
      const row = Array.isArray(restored) ? restored[0] : restored;
      await supabase
        .from("memberships")
        .update({ cancel_requested_at: null, cancel_effective_date: null })
        .eq("id", id);
      return okResult({ ...data, lessons_restored: row?.restored_count ?? 0 });
    }
    return okResult(data);
  },
});
