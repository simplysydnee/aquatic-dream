import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { adminClient, errResult, notAuthed, okResult, refuseUnconfirmed } from "./_client";

export default defineTool({
  name: "update_standing_slot",
  title: "Update standing slot",
  description:
    "Update editable fields on a standing slot (capacity, day_of_week, start_time, end_time, swim_level, instructor_id, location, is_active). Only provided fields change. Requires confirm=true.",
  inputSchema: {
    id: z.string().uuid(),
    capacity: z.number().int().min(0).max(50).optional(),
    day_of_week: z.number().int().min(0).max(6).optional(),
    start_time: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/)
      .optional(),
    end_time: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/)
      .optional(),
    swim_level: z.enum(["white", "red", "yellow", "blue", "green"]).nullable().optional(),
    instructor_id: z.string().uuid().nullable().optional(),
    location: z.string().max(200).nullable().optional(),
    is_active: z.boolean().optional(),
    confirm: z.boolean().default(false),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const { id, confirm, is_active, ...rest } = input;
    const updates: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    );
    // The database column is `active`; the tool input uses `is_active`.
    if (is_active !== undefined) updates.active = is_active;
    if (Object.keys(updates).length === 0) return errResult("No fields provided to update");
    if (!confirm) {
      return refuseUnconfirmed(`Would update standing slot ${id}.`, { id, updates });
    }
    const supabase = adminClient(ctx);
    const { data, error } = await supabase
      .from("standing_slots")
      .update(updates)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return errResult(error.message);
    if (!data) return errResult("Standing slot not found");
    return okResult(data);
  },
});
