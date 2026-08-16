import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    let planKey = url.searchParams.get("plan_key");
    let swimLevel = url.searchParams.get("swim_level");
    let excludeHoldToken = url.searchParams.get("exclude_hold_token");
    if (req.method === "POST") {
      try {
        const body = await req.json();
        planKey = body.plan_key ?? planKey;
        swimLevel = body.swim_level ?? swimLevel;
        excludeHoldToken = body.exclude_hold_token ?? excludeHoldToken;
      } catch { /* no body */ }
    }


    let plansQuery = supabase
      .from("membership_plans")
      .select("id, plan_key, name, monthly_price_cents, active")
      .eq("active", true);
    if (planKey) plansQuery = plansQuery.eq("plan_key", planKey);
    const { data: plans, error: plansErr } = await plansQuery;
    if (plansErr) throw plansErr;

    const planKeys = (plans || []).map((p) => p.plan_key);
    if (planKeys.length === 0) {
      return new Response(JSON.stringify({ slots: [], plans: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: slots, error: slotsErr } = await supabase
      .from("standing_slots")
      .select("id, plan_key, instructor_id, day_of_week, start_time, end_time, capacity, active, swim_level, accepted_levels")
      .eq("active", true)
      .in("plan_key", planKeys);
    if (slotsErr) throw slotsErr;

    const instructorIds = Array.from(
      new Set((slots || []).map((s) => s.instructor_id).filter(Boolean))
    );
    const { data: instructors } = instructorIds.length
      ? await supabase.from("instructors").select("id, name").in("id", instructorIds)
      : { data: [] as { id: string; name: string }[] };

    const slotIds = (slots || []).map((s) => s.id);
    const { data: memberships } = slotIds.length
      ? await supabase
          .from("memberships")
          .select("standing_slot_id, status")
          .in("standing_slot_id", slotIds)
          .in("status", ["active", "pending_cancel", "paused"])
      : { data: [] as { standing_slot_id: string; status: string }[] };

    // The requester's own hold must not count against them, the same way the
    // capacity trigger excludes the row being evaluated.
    let excludeHoldId: string | null = null;
    if (excludeHoldToken) {
      const { data: ownHold } = await supabase
        .from("membership_holds")
        .select("id")
        .eq("token", excludeHoldToken)
        .maybeSingle();
      excludeHoldId = ownHold?.id ?? null;
    }

    // Phone-booked holds reserve a spot until they expire or are cancelled.
    let holdsQuery = supabase
      .from("membership_holds")
      .select("standing_slot_id")
      .in("standing_slot_id", slotIds)
      .eq("status", "held")
      .gt("held_until", new Date().toISOString());
    if (excludeHoldId) holdsQuery = holdsQuery.neq("id", excludeHoldId);
    const { data: holds } = slotIds.length
      ? await holdsQuery
      : { data: [] as { standing_slot_id: string }[] };


    const counts = new Map<string, number>();
    (memberships || []).forEach((m) => {
      counts.set(m.standing_slot_id, (counts.get(m.standing_slot_id) || 0) + 1);
    });
    (holds || []).forEach((h) => {
      counts.set(h.standing_slot_id, (counts.get(h.standing_slot_id) || 0) + 1);
    });


    const planMap = new Map((plans || []).map((p) => [p.plan_key, p]));
    const instMap = new Map((instructors || []).map((i) => [i.id, i.name]));

    let result = (slots || [])
      .map((s) => {
        const plan = planMap.get(s.plan_key);
        const enrolled = counts.get(s.id) || 0;
        const spots_left = (s.capacity ?? 0) - enrolled;
        return {
          id: s.id,
          plan_id: plan?.id,
          plan_key: plan?.plan_key,
          plan_name: plan?.name,
          monthly_price_cents: plan?.monthly_price_cents,
          instructor_id: s.instructor_id,
          instructor_name: s.instructor_id ? instMap.get(s.instructor_id) || null : null,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          capacity: s.capacity,
          swim_level: s.swim_level ?? null,
          accepted_levels: (s.accepted_levels as string[] | null) ?? null,
          enrolled_count: enrolled,
          spots_left,
          is_full: spots_left <= 0,
        };
      });

    // Optional level filter — only applies to kid_group (Small Group Swim).
    // A slot with no accepted_levels is unlocked and accepts ANY level; the
    // first swimmer to enroll locks it (DB trigger owns that).
    if (swimLevel) {
      result = result.filter((s) => {
        if (s.plan_key !== "kid_group") return true;
        if (!s.accepted_levels || s.accepted_levels.length === 0) return true;
        return s.accepted_levels.includes(swimLevel);
      });
    }


    return new Response(
      JSON.stringify({ slots: result, plans: plans || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("get-open-slots error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
