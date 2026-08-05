// Public, token-scoped read for a phone-booked hold, plus the conversion mark.
// Mirrors get-membership-by-token: service role behind an unguessable token,
// never exposing admin-level fields.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let token = url.searchParams.get("token");
    let action = url.searchParams.get("action") || "get";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        token = body?.token ?? token;
        action = body?.action ?? action;
      } catch { /* no body */ }
    }
    if (!token) return json({ error: "Missing token" }, 400);

    const HOLD_FIELDS =
      "id, status, plan_key, standing_slot_id, swim_level, swimmer_name, parent_name, parent_phone, parent_email, existing_waiver_id, held_until, converted_at";

    let { data: hold } = await supabase
      .from("membership_holds")
      .select(HOLD_FIELDS)
      .eq("token", token)
      .maybeSingle();

    // The batch invite link carries a group_token shared by every hold in the
    // family batch. Resolve it to the first hold still awaiting completion.
    type GroupEntry = {
      id: string;
      swimmerName: string;
      status: string;
      planKey: string;
      planName: string | null;
      monthlyPriceCents: number | null;
      swimLevel: string | null;
      existingWaiverId: string | null;
      heldUntil: string | null;
      slot: Record<string, unknown> | null;
    };
    let groupHolds: GroupEntry[] = [];
    let batchState: "all_converted" | "all_expired" | "mixed_terminal" | null = null;
    if (!hold) {
      const { data: group } = await supabase
        .from("membership_holds")
        .select(HOLD_FIELDS)
        .eq("group_token", token)
        .order("created_at", { ascending: true });
      if (group && group.length > 0) {
        const slotIds = [...new Set(group.map((g) => g.standing_slot_id).filter(Boolean))];
        const planKeys = [...new Set(group.map((g) => g.plan_key).filter(Boolean))];
        const { data: slotRows } = await supabase
          .from("standing_slots")
          .select(
            "id, plan_key, day_of_week, start_time, end_time, swim_level, accepted_levels, instructor_id, active",
          )
          .in("id", slotIds.length > 0 ? slotIds : ["00000000-0000-0000-0000-000000000000"]);
        const instructorIds = [
          ...new Set((slotRows ?? []).map((s) => s.instructor_id).filter(Boolean)),
        ];
        const { data: instRows } = instructorIds.length
          ? await supabase.from("instructors").select("id, name").in("id", instructorIds)
          : { data: [] as { id: string; name: string }[] };
        const { data: planRows } = await supabase
          .from("membership_plans")
          .select("plan_key, name, monthly_price_cents")
          .in("plan_key", planKeys.length > 0 ? planKeys : ["__none__"]);

        const slotById = new Map((slotRows ?? []).map((s) => [s.id, s]));
        const instById = new Map((instRows ?? []).map((i) => [i.id, i.name]));
        const planByKey = new Map((planRows ?? []).map((p) => [p.plan_key, p]));

        groupHolds = group.map((g) => {
          const s = slotById.get(g.standing_slot_id);
          const p = planByKey.get(g.plan_key);
          return {
            id: g.id,
            swimmerName: g.swimmer_name,
            // Every entry gets the same expiry recomputation the single hold gets.
            status: recomputeStatus(g.status, g.held_until),
            planKey: g.plan_key,
            planName: p?.name ?? null,
            monthlyPriceCents: p?.monthly_price_cents ?? null,
            swimLevel: g.swim_level,
            existingWaiverId: g.existing_waiver_id,
            heldUntil: g.held_until,
            slot: s
              ? {
                  id: s.id,
                  plan_key: s.plan_key,
                  day_of_week: s.day_of_week,
                  start_time: s.start_time,
                  end_time: s.end_time,
                  swim_level: s.swim_level,
                  accepted_levels: s.accepted_levels,
                  instructor_name: s.instructor_id ? instById.get(s.instructor_id) ?? null : null,
                  active: s.active,
                }
              : null,
          };
        });

        const stillHeld = groupHolds.filter((g) => g.status === "held");
        if (stillHeld.length === 0) {
          const converted = groupHolds.filter((g) => g.status === "converted").length;
          const expiredish = groupHolds.length - converted;
          batchState =
            converted === groupHolds.length
              ? "all_converted"
              : expiredish === groupHolds.length
              ? "all_expired"
              : "mixed_terminal";
        }
        hold =
          group.find((g) => g.id === stillHeld[0]?.id) ??
          group.find((g) => g.status === "held") ??
          group[0];
      }
    }
    if (!hold) return json({ error: "Not found" }, 404);



    if (action === "convert") {
      if (hold.status === "converted") return json({ success: true, alreadyConverted: true });
      const { error: updErr } = await supabase
        .from("membership_holds")
        .update({ status: "converted", converted_at: new Date().toISOString() })
        .eq("id", hold.id);
      if (updErr) return json({ error: "Could not update hold" }, 500);
      return json({ success: true });
    }

    const expired = hold.status === "held" && new Date(hold.held_until).getTime() <= Date.now();
    const status = expired ? "expired" : hold.status;

    const { data: slot } = await supabase
      .from("standing_slots")
      .select("id, plan_key, day_of_week, start_time, end_time, capacity, swim_level, accepted_levels, instructor_id, active")
      .eq("id", hold.standing_slot_id)
      .maybeSingle();

    let instructorName: string | null = null;
    if (slot?.instructor_id) {
      const { data: inst } = await supabase
        .from("instructors")
        .select("name")
        .eq("id", slot.instructor_id)
        .maybeSingle();
      instructorName = inst?.name ?? null;
    }

    const { data: plan } = await supabase
      .from("membership_plans")
      .select("id, plan_key, name, monthly_price_cents")
      .eq("plan_key", hold.plan_key)
      .maybeSingle();

    return json({
      hold: {
        status,
        planKey: hold.plan_key,
        swimLevel: hold.swim_level,
        swimmerName: hold.swimmer_name,
        parentName: hold.parent_name,
        parentPhone: hold.parent_phone,
        parentEmail: hold.parent_email,
        existingWaiverId: hold.existing_waiver_id,
        heldUntil: hold.held_until,
        groupHolds,
      },
      plan: plan ?? null,
      slot: slot
        ? {
            id: slot.id,
            plan_key: slot.plan_key,
            day_of_week: slot.day_of_week,
            start_time: slot.start_time,
            end_time: slot.end_time,
            swim_level: slot.swim_level,
            accepted_levels: slot.accepted_levels,
            instructor_name: instructorName,
            active: slot.active,
          }
        : null,
    });
  } catch (e) {
    console.error("[get-membership-hold] error", e);
    return json({ error: "Something went wrong" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
