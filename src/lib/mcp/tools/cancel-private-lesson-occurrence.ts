import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { adminClient, errResult, notAuthed, okResult, refuseUnconfirmed } from "./_client";

export default defineTool({
  name: "cancel_private_lesson_occurrence",
  title: "Cancel a private lesson occurrence",
  description:
    "Mark a single lesson_booking_occurrences row as cancelled (admin cancel — skips charge). Requires confirm=true.",
  inputSchema: {
    occurrence_id: z.string().uuid(),
    reason: z.string().max(500).optional(),
    skip_charge: z
      .boolean()
      .default(true)
      .describe("If true (default), sets charge_status to 'skipped' so the family is not billed."),
    confirm: z.boolean().default(false),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ occurrence_id, reason, skip_charge, confirm }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    if (!confirm) {
      return refuseUnconfirmed(`Would cancel private lesson occurrence ${occurrence_id}.`, {
        occurrence_id,
        reason,
        skip_charge,
      });
    }
    const supabase = adminClient(ctx);
    const updates: Record<string, unknown> = {
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason ?? "Admin cancellation via MCP",
    };
    if (skip_charge) updates.charge_status = "skipped";
    const { data, error } = await supabase
      .from("lesson_booking_occurrences")
      .update(updates)
      .eq("id", occurrence_id)
      .select("id, status, cancel_reason, charge_status, occurrence_date")
      .maybeSingle();
    if (error) return errResult(error.message);
    if (!data) return errResult("Occurrence not found");
    return okResult(data);
  },
});
