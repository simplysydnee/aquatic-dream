import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { adminClient, errResult, notAuthed, okResult, refuseUnconfirmed } from "./_client";

export default defineTool({
  name: "move_membership_slot",
  title: "Move membership to a different standing slot",
  description:
    "Reassign a membership to a different standing slot (day/time/level). Verifies destination slot exists, is active, matches plan_key, and has capacity. Requires confirm=true.",
  inputSchema: {
    membership_id: z.string().uuid(),
    new_standing_slot_id: z.string().uuid(),
    confirm: z.boolean().default(false),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ membership_id, new_standing_slot_id, confirm }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const supabase = adminClient(ctx);
    const { data: m, error: mErr } = await supabase
      .from("memberships")
      .select("id, plan_key, standing_slot_id, status")
      .eq("id", membership_id)
      .maybeSingle();
    if (mErr) return errResult(mErr.message);
    if (!m) return errResult("Membership not found");

    const { data: slot, error: sErr } = await supabase
      .from("standing_slots")
      .select("id, plan_key, is_active, capacity, day_of_week, start_time, end_time, swim_level")
      .eq("id", new_standing_slot_id)
      .maybeSingle();
    if (sErr) return errResult(sErr.message);
    if (!slot) return errResult("Destination slot not found");
    if (!slot.is_active) return errResult("Destination slot is not active");
    if (slot.plan_key !== m.plan_key)
      return errResult(`Plan mismatch: membership is ${m.plan_key}, slot is ${slot.plan_key}`);

    const { count, error: cErr } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("standing_slot_id", new_standing_slot_id)
      .in("status", ["active", "past_due", "pending"]);
    if (cErr) return errResult(cErr.message);
    const enrolled = count ?? 0;
    if (enrolled >= (slot.capacity ?? 0))
      return errResult(`Destination slot is full (${enrolled}/${slot.capacity})`);

    if (!confirm) {
      return refuseUnconfirmed(
        `Would move membership ${membership_id} from slot ${m.standing_slot_id} to ${new_standing_slot_id}.`,
        { destination: slot, current_enrolled: enrolled },
      );
    }
    const { data, error } = await supabase
      .from("memberships")
      .update({ standing_slot_id: new_standing_slot_id })
      .eq("id", membership_id)
      .select("id, standing_slot_id")
      .maybeSingle();
    if (error) return errResult(error.message);
    return okResult({ ...data, destination_slot: slot });
  },
});
