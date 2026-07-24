import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { adminClient, errResult, notAuthed, okResult, refuseUnconfirmed } from "./_client";

export default defineTool({
  name: "update_swim_enrollment",
  title: "Update a swim enrollment",
  description:
    "Update editable fields on a swim_enrollments row: parent_phone, swim_level, status, session_fee_status, session_fee_payment_method, session_fee_payment_reference. Only provided fields change. Requires confirm=true.",
  inputSchema: {
    id: z.string().uuid(),
    parent_phone: z.string().min(5).max(30).optional(),
    swim_level: z.enum(["white", "red", "yellow", "blue", "green"]).optional(),
    status: z.enum(["active", "cancelled", "pending", "waitlist"]).optional(),
    session_fee_status: z.enum(["paid", "unpaid", "refunded", "waived"]).optional(),
    session_fee_payment_method: z.string().max(50).optional(),
    session_fee_payment_reference: z.string().max(200).optional(),
    confirm: z.boolean().default(false),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const { id, confirm, ...rest } = input;
    const updates = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    if (Object.keys(updates).length === 0) return errResult("No fields provided to update");
    if (!confirm) {
      return refuseUnconfirmed(`Would update swim_enrollments ${id}.`, { id, updates });
    }
    const supabase = adminClient(ctx);
    const { data, error } = await supabase
      .from("swim_enrollments")
      .update(updates)
      .eq("id", id)
      .select("id, parent_phone, swim_level, status, session_fee_status, session_fee_payment_method, session_fee_payment_reference")
      .maybeSingle();
    if (error) return errResult(error.message);
    if (!data) return errResult("Enrollment not found");
    return okResult(data);
  },
});
