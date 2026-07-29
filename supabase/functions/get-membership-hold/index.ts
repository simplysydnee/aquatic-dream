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

    const { data: hold, error } = await supabase
      .from("membership_holds")
      .select("id, status, plan_key, standing_slot_id, swim_level, swimmer_name, parent_name, parent_phone, parent_email, existing_waiver_id, held_until, converted_at")
      .eq("token", token)
      .maybeSingle();
    if (error || !hold) return json({ error: "Not found" }, 404);

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
        heldUntil: hold.held_until,
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
