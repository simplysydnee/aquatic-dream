import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { adminClient, errResult, notAuthed, okResult, refuseUnconfirmed } from "./_client";

export default defineTool({
  name: "reassign_private_lesson_instructor",
  title: "Reassign instructor on a private lesson occurrence",
  description:
    "Override the instructor on a single lesson_booking_occurrences row (does not change other occurrences in the series). Requires confirm=true.",
  inputSchema: {
    occurrence_id: z.string().uuid(),
    new_instructor_id: z.string().uuid(),
    confirm: z.boolean().default(false),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ occurrence_id, new_instructor_id, confirm }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const supabase = adminClient(ctx);
    const { data: instructor, error: iErr } = await supabase
      .from("instructors")
      .select("id, name")
      .eq("id", new_instructor_id)
      .maybeSingle();
    if (iErr) return errResult(iErr.message);
    if (!instructor) return errResult("Instructor not found");
    if (!confirm) {
      return refuseUnconfirmed(
        `Would reassign occurrence ${occurrence_id} to ${instructor.name}.`,
        { occurrence_id, instructor },
      );
    }
    const { data, error } = await supabase
      .from("lesson_booking_occurrences")
      .update({
        instructor_override_id: instructor.id,
        instructor_override_name: instructor.name,
      })
      .eq("id", occurrence_id)
      .select("id, occurrence_date, instructor_override_id, instructor_override_name")
      .maybeSingle();
    if (error) return errResult(error.message);
    if (!data) return errResult("Occurrence not found");
    return okResult(data);
  },
});
