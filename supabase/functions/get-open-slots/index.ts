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
    const planKey = url.searchParams.get("plan_key");

    let plansQuery = supabase
      .from("membership_plans")
      .select("id, plan_key, name, monthly_price_cents, active")
      .eq("active", true);
    if (planKey) plansQuery = plansQuery.eq("plan_key", planKey);
    const { data: plans, error: plansErr } = await plansQuery;
    if (plansErr) throw plansErr;

    const planIds = (plans || []).map((p) => p.id);
    if (planIds.length === 0) {
      return new Response(JSON.stringify({ slots: [], plans: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: slots, error: slotsErr } = await supabase
      .from("standing_slots")
      .select("id, plan_id, instructor_id, day_of_week, start_time, end_time, capacity, active")
      .eq("active", true)
      .in("plan_id", planIds);
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

    const counts = new Map<string, number>();
    (memberships || []).forEach((m) => {
      counts.set(m.standing_slot_id, (counts.get(m.standing_slot_id) || 0) + 1);
    });

    const planMap = new Map((plans || []).map((p) => [p.id, p]));
    const instMap = new Map((instructors || []).map((i) => [i.id, i.name]));

    const result = (slots || [])
      .map((s) => {
        const plan = planMap.get(s.plan_id);
        const enrolled = counts.get(s.id) || 0;
        const spots_left = (s.capacity ?? 0) - enrolled;
        return {
          id: s.id,
          plan_id: s.plan_id,
          plan_key: plan?.plan_key,
          plan_name: plan?.name,
          monthly_price_cents: plan?.monthly_price_cents,
          instructor_id: s.instructor_id,
          instructor_name: s.instructor_id ? instMap.get(s.instructor_id) || null : null,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          capacity: s.capacity,
          enrolled_count: enrolled,
          spots_left,
        };
      })
      .filter((s) => s.spots_left > 0);

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
