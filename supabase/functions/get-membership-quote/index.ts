import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { computeMembershipQuote } from "../_shared/membership-pricing.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { plan_key, standing_slot_id } = body ?? {};

    if (!["kid_group", "private", "adult_group"].includes(plan_key)) {
      return json({ error: "Invalid plan_key" }, 400);
    }
    if (typeof standing_slot_id !== "string" || !uuidRe.test(standing_slot_id)) {
      return json({ error: "Invalid standing_slot_id" }, 400);
    }

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("membership_plans")
      .select("id, plan_key, monthly_price_cents, active")
      .eq("plan_key", plan_key)
      .maybeSingle();
    if (planErr || !plan || !plan.active) return json({ error: "Plan not available" }, 404);

    const { data: slot, error: slotErr } = await supabaseAdmin
      .from("standing_slots")
      .select("id, plan_key, day_of_week, active")
      .eq("id", standing_slot_id)
      .maybeSingle();
    if (slotErr || !slot || !slot.active) return json({ error: "Slot not available" }, 404);
    if (slot.plan_key !== plan.plan_key) return json({ error: "Slot does not match plan" }, 400);

    const q = computeMembershipQuote(slot.day_of_week, plan.monthly_price_cents);

    return json({
      monthlyCents: q.monthlyCents,
      firstChargeCents: q.firstChargeCents,
      firstLessonDate: q.firstLessonDate,
      firstLessonLabel: q.firstLessonLabel,
      billingStart: q.billingStart,
      billingStartLabel: q.billingStartLabel,
      lessonsCovered: q.lessonsCovered,
      totalLessonsInMonth: q.totalLessonsInMonth,
      refMonthName: q.refMonthName,
    });
  } catch (e) {
    console.error("[get-membership-quote] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
