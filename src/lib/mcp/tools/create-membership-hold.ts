import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errResult, notAuthed, okResult, refuseUnconfirmed } from "./_client";

export default defineTool({
  name: "create_membership_hold",
  title: "Create a membership hold",
  description:
    "Hold a standing slot for a swimmer and text the parent a link to finish enrollment. Thin wrapper around the create-membership-hold edge function (capacity checks and SMS happen there). Requires confirm=true.",
  inputSchema: {
    standing_slot_id: z.string().uuid(),
    swimmer_name: z.string(),
    parent_name: z.string(),
    parent_phone: z.string(),
    parent_email: z.string().optional(),
    swim_level: z.enum(["white", "red", "yellow", "blue", "green"]).optional(),
    existing_waiver_id: z.string().uuid().optional(),
    notes: z.string().optional(),
    hold_minutes: z.number().optional().describe("Hold length in minutes. Defaults to 48 hours."),
    confirm: z.boolean().default(false),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const { confirm, ...fields } = input;
    if (!confirm) {
      return refuseUnconfirmed(
        `Would hold slot ${fields.standing_slot_id} for ${fields.swimmer_name} (parent ${fields.parent_name}, ${fields.parent_phone}).`,
        fields,
      );
    }

    const baseUrl = process.env.SUPABASE_URL;
    if (!baseUrl) return errResult("SUPABASE_URL is not configured");

    const res = await fetch(`${baseUrl}/functions/v1/create-membership-hold`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.getToken()}`,
      },
      body: JSON.stringify(fields),
    });

    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      const message =
        (body as { error?: string })?.error ?? `create-membership-hold failed (${res.status})`;
      return errResult(message);
    }
    return okResult(body);
  },
});
