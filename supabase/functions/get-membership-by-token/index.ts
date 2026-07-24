import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Public read endpoint scoped by manage_token. Never exposes admin-level fields.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: m, error } = await supabase
      .from("memberships")
      .select(
        "id, status, plan_key, parent_first_name, parent_last_name, child_first_name, child_last_name, start_date, standing_slot_id, recurring_consent_amount_cents, cancel_effective_date, cancel_requested_at",
      )
      .eq("manage_token", token)
      .maybeSingle();

    if (error || !m) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let slot: Record<string, unknown> | null = null;
    if (m.standing_slot_id) {
      const { data: s } = await supabase
        .from("standing_slots")
        .select("day_of_week, start_time, level:swim_level")
        .eq("id", m.standing_slot_id)
        .maybeSingle();
      slot = s || null;
    }

    const { data: nextOcc } = await supabase
      .from("membership_occurrences")
      .select("occurrence_date, start_time")
      .eq("membership_id", m.id)
      .gte("occurrence_date", new Date().toISOString().slice(0, 10))
      .order("occurrence_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        membership: {
          id: m.id,
          status: m.status,
          planKey: m.plan_key,
          parentFirstName: m.parent_first_name,
          parentLastName: m.parent_last_name,
          childFirstName: m.child_first_name,
          childLastName: m.child_last_name,
          startDate: m.start_date,
          monthlyPriceCents: m.recurring_consent_amount_cents,
          cancelEffectiveDate: m.cancel_effective_date,
          cancelRequestedAt: m.cancel_requested_at,
          slot,
          nextOccurrence: nextOcc || null,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[get-membership-by-token] error", e);
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
