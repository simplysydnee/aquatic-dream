import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errResult, notAuthed, okResult, refuseUnconfirmed } from "./_client";

export default defineTool({
  name: "complete_membership_checkout",
  title: "Complete membership checkout",
  description:
    "Recovery tool: finish a membership signup from its Stripe checkout session id (cs_...). Creates the Stripe subscription if missing, writes the membership row, generates lesson occurrences, and sends the welcome message. Safe to re-run — it is idempotent. Requires confirm=true.",
  inputSchema: {
    session_id: z
      .string()
      .regex(/^cs_(test|live)_[A-Za-z0-9]+$/)
      .describe("Stripe Checkout session id from the membership signup."),
    confirm: z.boolean().default(false),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ session_id, confirm }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    if (!confirm) {
      return refuseUnconfirmed(
        `Would complete the membership for checkout session ${session_id}.`,
        { session_id },
      );
    }

    try {
      const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/confirm-membership-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${ctx.getToken()}`,
        },
        body: JSON.stringify({ sessionId: session_id }),
      });
      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text.slice(0, 500) };
      }
      if (!res.ok) {
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: unknown }).error)
            : text.slice(0, 300);
        return errResult(`Membership completion failed (${res.status}): ${message}`);
      }
      return okResult(body);
    } catch (error) {
      return errResult(error instanceof Error ? error.message : String(error));
    }
  },
});
