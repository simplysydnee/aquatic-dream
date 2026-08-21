import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { adminClient, errResult, notAuthed, okResult, refuseUnconfirmed } from "./_client";

export default defineTool({
  name: "cancel_membership",
  title: "Cancel membership",
  description:
    "Mark a membership as canceled in the database, record a cancellation row, and cancel its future lessons (scheduled occurrences on/after the effective date; past lessons and holiday closures are untouched). Does NOT cancel the Stripe subscription — do that separately in Stripe if needed. Requires confirm=true.",
  inputSchema: {
    id: z.string().uuid(),
    effective_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Cancellation effective date (YYYY-MM-DD). Defaults to today."),
    reason: z.string().max(100).optional(),
    reason_detail: z.string().max(1000).optional(),
    confirm: z.boolean().default(false),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ id, effective_date, reason, reason_detail, confirm }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const effective = effective_date ?? new Date().toISOString().slice(0, 10);
    if (!confirm) {
      return refuseUnconfirmed(`Would cancel membership ${id} effective ${effective}.`, {
        id,
        effective,
        reason,
      });
    }
    const supabase = adminClient(ctx);
    const nowIso = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("memberships")
      .update({
        status: "cancelled",
        cancel_requested_at: nowIso,
        cancel_effective_date: effective,
      })
      .eq("id", id);
    if (upErr) return errResult(upErr.message);
    const { data: cancelRow, error: insErr } = await supabase
      .from("membership_cancellations")
      .insert({
        membership_id: id,
        effective_date: effective,
        reason: reason ?? null,
        reason_detail: reason_detail ?? null,
      })
      .select("id")
      .maybeSingle();
    if (insErr) return errResult(`membership updated, but cancellation row failed: ${insErr.message}`);

    // Close future lessons through the same routine the public cancel path uses.
    const { data: applied, error: occErr } = await supabase.rpc("apply_membership_cancellation", {
      p_membership_id: id,
      p_cancellation_id: cancelRow?.id ?? null,
      p_effective_date: effective,
    });
    if (occErr) {
      return errResult(`membership cancelled, but future lessons were not closed: ${occErr.message}`);
    }
    const result = Array.isArray(applied) ? applied[0] : applied;
    return okResult({
      id,
      status: "cancelled",
      effective_date: effective,
      cancellation_id: cancelRow?.id ?? null,
      lessons_cancelled_from: result?.cutoff_date ?? effective,
      lessons_cancelled: result?.cancelled_count ?? 0,
    });
  },
});
