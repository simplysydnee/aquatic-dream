import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

const RecipientSchema = z.object({
  phone: z.string().min(5),
  childNames: z.array(z.string()).optional().default([]),
});

export default defineTool({
  name: "send_private_openings_sms",
  title: "Send private lesson openings SMS blast",
  description:
    "Send a bulk SMS blast (via TextMagic) to a list of past private-lesson families about open private slots on a specific date. Delegates to the existing admin-only send-bulk-outreach-sms edge function. REQUIRES confirm=true to actually send; without it the tool refuses. Use list_open_private_slots + list_past_private_families first, preview the template with the user, then call again with confirm=true.",
  inputSchema: {
    template: z
      .string()
      .min(5)
      .max(1000)
      .describe(
        "SMS body. Supports {{childNames}} (per-recipient) and {{date}} placeholders resolved by the sender function.",
      ),
    dateLabel: z
      .string()
      .min(1)
      .describe("Human-readable date label, e.g. 'Sat Aug 30'. Passed as startDateLabel."),
    recipients: z.array(RecipientSchema).min(1).max(500),
    reminderKind: z.string().default("saturday_openings_sms"),
    confirm: z
      .boolean()
      .default(false)
      .describe("Must be true to actually send. When false the tool returns without sending."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  handler: async ({ template, dateLabel, recipients, reminderKind, confirm }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    if (!confirm) {
      return {
        content: [
          {
            type: "text",
            text: `Refusing to send: confirm=false. Would text ${recipients.length} recipient(s) for ${dateLabel}. Re-call with confirm=true to actually send.`,
          },
        ],
        structuredContent: {
          would_send: recipients.length,
          date_label: dateLabel,
          reminder_kind: reminderKind,
          preview_template: template,
        },
      };
    }

    const url = `${process.env.SUPABASE_URL}/functions/v1/send-bulk-outreach-sms`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.getToken()}`,
      },
      body: JSON.stringify({
        template,
        startDateLabel: dateLabel,
        recipients,
        reminderKind,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `send-bulk-outreach-sms failed (${res.status}): ${text}` }],
        isError: true,
      };
    }
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    return {
      content: [{ type: "text", text }],
      structuredContent: (parsed as any) ?? { raw: text },
    };
  },
});
