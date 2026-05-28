// Cancels a single occurrence by cancel_token. Applies 24h policy.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  cancel_token: z.string().min(8).max(128),
  reason: z.string().max(500).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return j({ error: parsed.error.flatten() }, 400);

    const { data: occ } = await supabase
      .from("lesson_booking_occurrences")
      .select("*, lesson_bookings!inner(start_time, cancellation_policy_hours, parent_email, parent_name, child_name)")
      .eq("cancel_token", parsed.data.cancel_token)
      .maybeSingle();

    if (!occ) return j({ error: "Invalid token" }, 404);
    if ((occ as any).status === "cancelled") return j({ success: true, already: true });

    const b: any = (occ as any).lesson_bookings;
    const policyHours = b?.cancellation_policy_hours ?? 24;
    const lessonStart = new Date(`${(occ as any).occurrence_date}T${b.start_time}`);
    const hoursUntil = (lessonStart.getTime() - Date.now()) / (1000 * 60 * 60);
    const within = hoursUntil < policyHours;

    await supabase.from("lesson_booking_occurrences").update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: parsed.data.reason || (within ? "Late cancellation" : "Cancelled by customer"),
      // Within policy window → still charge as scheduled. Outside → skip charge.
      auto_charge_status: within ? "pending" : "skipped",
    }).eq("id", (occ as any).id);

    return j({ success: true, within_policy_window: within, hours_until: hoursUntil });
  } catch (err: any) {
    console.error("cancel-private-lesson-occurrence error", err);
    return j({ error: err?.message || "Internal error" }, 500);
  }
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
