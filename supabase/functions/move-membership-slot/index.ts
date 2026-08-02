import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireAdminOrServiceRole } from "../_shared/auth-guard.ts";
import { fetchClosureDateSet } from "../_shared/closure-schedule.ts";
import { buildMembershipOccurrenceRows } from "../_shared/membership-occurrences.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const OCCUPYING_STATUSES = ["active", "pending_cancel", "paused"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function todayPT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const guard = await requireAdminOrServiceRole(req);
  if (!guard.ok) return json({ error: guard.error || "Unauthorized" }, guard.status || 401);

  try {
    const body = await req.json();
    const membershipId = typeof body?.membership_id === "string" ? body.membership_id : "";
    const targetSlotId = typeof body?.target_slot_id === "string" ? body.target_slot_id : "";
    if (!membershipId || !targetSlotId) {
      return json({ error: "membership_id and target_slot_id are required" }, 400);
    }

    const { data: membership, error: mErr } = await supabase
      .from("memberships")
      .select("id, plan_key, standing_slot_id, status, swim_level, start_date")
      .eq("id", membershipId)
      .maybeSingle();
    if (mErr) return json({ error: mErr.message }, 500);
    if (!membership) return json({ error: "Membership not found" }, 404);
    if (membership.standing_slot_id === targetSlotId) {
      return json({ error: "Membership is already in that slot" }, 400);
    }

    const { data: slot, error: sErr } = await supabase
      .from("standing_slots")
      .select("id, plan_key, day_of_week, start_time, end_time, instructor_id, capacity, active, swim_level, accepted_levels")
      .eq("id", targetSlotId)
      .maybeSingle();
    if (sErr) return json({ error: sErr.message }, 500);
    if (!slot) return json({ error: "Target slot not found" }, 404);
    if (!slot.active) return json({ error: "That slot is not active" }, 400);
    if (slot.plan_key !== membership.plan_key) {
      return json({ error: "That slot belongs to a different program" }, 400);
    }

    // Capacity — same rule get-open-slots uses.
    const { count, error: cErr } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("standing_slot_id", targetSlotId)
      .in("status", OCCUPYING_STATUSES);
    if (cErr) return json({ error: cErr.message }, 500);
    const enrolled = count ?? 0;
    if (enrolled >= (slot.capacity ?? 0)) {
      return json({ error: `That class is full (${enrolled} of ${slot.capacity}).` }, 409);
    }

    // Level match for Small Group.
    if (membership.plan_key === "kid_group") {
      const level = (membership.swim_level as string | null) ?? null;
      const accepted = (slot.accepted_levels as string[] | null) ?? null;
      const allowed = accepted && accepted.length > 0
        ? accepted
        : slot.swim_level
        ? [slot.swim_level as string]
        : [];
      if (!level) {
        return json({ error: "Assign a swim level to this swimmer before moving them to a Small Group slot." }, 400);
      }
      if (allowed.length > 0 && !allowed.includes(level)) {
        return json(
          { error: `That class does not accept ${level} swimmers (accepts ${allowed.join(", ")}).` },
          400,
        );
      }
    }

    const { error: upErr } = await supabase
      .from("memberships")
      .update({ standing_slot_id: targetSlotId })
      .eq("id", membershipId);
    if (upErr) return json({ error: upErr.message }, 500);

    // Remove future scheduled occurrences only. Past and closed stay put.
    const today = todayPT();
    const { data: removed, error: delErr } = await supabase
      .from("membership_occurrences")
      .delete()
      .eq("membership_id", membershipId)
      .eq("status", "scheduled")
      .gte("occurrence_date", today)
      .select("id");
    if (delErr) return json({ error: delErr.message }, 500);
    const removedCount = removed?.length ?? 0;

    const closureDates = await fetchClosureDateSet();
    const rows = buildMembershipOccurrenceRows({
      membershipId,
      slot: {
        day_of_week: Number(slot.day_of_week ?? 0),
        start_time: (slot.start_time as string | null) ?? null,
        end_time: (slot.end_time as string | null) ?? null,
        instructor_id: (slot.instructor_id as string | null) ?? null,
      },
      startISO: today,
      closureDates,
      count: removedCount > 0 ? removedCount : 8,
    });

    if (rows.length > 0) {
      const { error: insErr } = await supabase
        .from("membership_occurrences")
        .upsert(rows, { onConflict: "membership_id,occurrence_date", ignoreDuplicates: true });
      if (insErr) return json({ error: `Slot updated but rescheduling failed: ${insErr.message}` }, 500);
    }

    console.log(
      `[move-membership-slot] membership ${membershipId} -> slot ${targetSlotId}; removed ${removedCount}, created ${rows.length}`,
    );

    return json({
      ok: true,
      membership_id: membershipId,
      previous_slot_id: membership.standing_slot_id,
      new_slot_id: targetSlotId,
      removed_occurrences: removedCount,
      created_occurrences: rows.length,
      new_dates: rows.map((r) => r.occurrence_date),
      day_of_week: slot.day_of_week,
      start_time: slot.start_time,
      end_time: slot.end_time,
    });
  } catch (e) {
    console.error("[move-membership-slot] error", e);
    return json({ error: e instanceof Error ? e.message : "Something went wrong" }, 500);
  }
});
