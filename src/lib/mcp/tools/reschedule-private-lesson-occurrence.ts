import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { adminClient, errResult, notAuthed, okResult, refuseUnconfirmed } from "./_client";

export default defineTool({
  name: "reschedule_private_lesson_occurrence",
  title: "Reschedule a private lesson occurrence",
  description:
    "Move a single lesson_booking_occurrences row to a new date and/or start/end time. Does NOT check instructor availability — verify with list_open_private_slots first. Requires confirm=true.",
  inputSchema: {
    occurrence_id: z.string().uuid(),
    new_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    new_start_time: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/)
      .optional(),
    new_end_time: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/)
      .optional(),
    confirm: z.boolean().default(false),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ occurrence_id, new_date, new_start_time, new_end_time, confirm }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const updates: Record<string, unknown> = {};
    if (new_date) updates.occurrence_date = new_date;
    if (new_start_time) updates.start_time_override = new_start_time;
    if (new_end_time) updates.end_time_override = new_end_time;
    if (Object.keys(updates).length === 0) return errResult("Provide at least one of new_date, new_start_time, new_end_time");
    if (!confirm) {
      return refuseUnconfirmed(`Would reschedule occurrence ${occurrence_id}.`, {
        occurrence_id,
        updates,
      });
    }
    const supabase = adminClient(ctx);
    const { data, error } = await supabase
      .from("lesson_booking_occurrences")
      .update(updates)
      .eq("id", occurrence_id)
      .select("id, occurrence_date, start_time_override, end_time_override, status")
      .maybeSingle();
    if (error) return errResult(error.message);
    if (!data) return errResult("Occurrence not found");
    return okResult(data);
  },
});
