// Admin-only: hold a standing slot for 48 hours and text the parent a link to
// finish enrollment on their own device. NO membership and NO Stripe object is
// created here — the existing /join checkout path still does all of that.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { formatPTTime, sendAndLogBookingConfirmation } from "../_shared/textmagic.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SITE_URL = "https://aquaticdreamsswim.com";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PLAN_LABELS: Record<string, string> = {
  kid_group: "Small Group Swim",
  private: "Private Swim",
  adult_group: "Adult Swim",
};

const makeToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) return json({ error: "Invalid auth token" }, 401);
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Admin role required" }, 403);

    const body = await req.json();
    const standingSlotId = String(body?.standing_slot_id || "");
    const swimmerName = String(body?.swimmer_name || "").trim();
    const parentName = String(body?.parent_name || "").trim();
    const parentPhone = String(body?.parent_phone || "").trim();
    const parentEmail = (String(body?.parent_email || "").trim() || null)?.toLowerCase() ?? null;
    const swimLevel = body?.swim_level ? String(body.swim_level) : null;
    const notes = String(body?.notes || "").trim() || null;
    const existingWaiverId = body?.existing_waiver_id ? String(body.existing_waiver_id) : null;
    const hoursValue = Number(body?.hold_hours);
    const holdHours = Number.isFinite(hoursValue) && hoursValue > 0 && hoursValue <= 168
      ? hoursValue
      : 48;

    if (!standingSlotId) return json({ error: "standing_slot_id required" }, 400);
    if (!swimmerName) return json({ error: "Swimmer name required" }, 400);
    if (!parentName) return json({ error: "Parent name required" }, 400);
    if (parentPhone.replace(/\D/g, "").length < 10) {
      return json({ error: "A valid parent phone is required" }, 400);
    }

    const { data: slot, error: slotErr } = await supabaseAdmin
      .from("standing_slots")
      .select("id, plan_key, day_of_week, start_time, end_time, capacity, active, instructor_id, swim_level, accepted_levels")
      .eq("id", standingSlotId)
      .maybeSingle();
    if (slotErr || !slot) return json({ error: "Slot not found" }, 404);
    if (!slot.active) return json({ error: "That slot is not bookable" }, 409);

    // Level gate for Small Group. Unknown level is allowed — the assessment on
    // the parent's page settles it.
    if (slot.plan_key === "kid_group" && swimLevel) {
      const accepted = (slot.accepted_levels as string[] | null) ?? null;
      const ok = accepted && accepted.length > 0
        ? accepted.includes(swimLevel)
        : slot.swim_level === swimLevel;
      if (!ok) return json({ error: "That class does not accept this swim level" }, 409);
    }

    // Capacity: memberships (active/pending_cancel/paused) + live holds.
    const nowIso = new Date().toISOString();
    const [{ count: memberCount, error: memErr }, { count: holdCount, error: holdErr }] =
      await Promise.all([
        supabaseAdmin
          .from("memberships")
          .select("id", { count: "exact", head: true })
          .eq("standing_slot_id", slot.id)
          .in("status", ["active", "pending_cancel", "paused"]),
        supabaseAdmin
          .from("membership_holds")
          .select("id", { count: "exact", head: true })
          .eq("standing_slot_id", slot.id)
          .eq("status", "held")
          .gt("held_until", nowIso),
      ]);
    if (memErr || holdErr) return json({ error: "Capacity check failed" }, 500);
    const spotsLeft = (slot.capacity ?? 0) - (memberCount ?? 0) - (holdCount ?? 0);
    if (spotsLeft <= 0) return json({ error: "That slot is already full" }, 409);

    const heldUntil = new Date(Date.now() + holdHours * 60 * 60 * 1000).toISOString();
    const token = makeToken();

    const { data: hold, error: insErr } = await supabaseAdmin
      .from("membership_holds")
      .insert({
        token,
        plan_key: slot.plan_key,
        standing_slot_id: slot.id,
        swim_level: slot.plan_key === "kid_group" ? swimLevel : null,
        swimmer_name: swimmerName,
        parent_name: parentName,
        parent_phone: parentPhone,
        parent_email: parentEmail,
        existing_waiver_id: existingWaiverId,
        notes,
        held_until: heldUntil,
        created_by: userData.user.email || userData.user.id,
      })
      .select("id, token, held_until")
      .single();
    if (insErr || !hold) {
      console.error("[create-membership-hold] insert failed", insErr);
      return json({ error: "Could not create the hold" }, 500);
    }

    const firstName = swimmerName.split(/\s+/)[0] || swimmerName;
    const program = PLAN_LABELS[slot.plan_key] || "swim";
    const when = `${DAYS[slot.day_of_week] ?? ""} ${formatPTTime(slot.start_time)}`.trim();
    const link = `${SITE_URL}/join?hold=${hold.token}`;
    const message =
      `Aquatic Dreams: we're holding a ${program} spot for ${firstName}, ${when}. ` +
      `Finish enrollment within 48 hrs: ${link}`;

    const smsResult = await sendAndLogBookingConfirmation(supabaseAdmin, {
      phoneRaw: parentPhone,
      message,
      swimmer_name: swimmerName,
      reminder_kind: "membership_hold_invite",
    });

    if (smsResult.ok) {
      await supabaseAdmin
        .from("membership_holds")
        .update({ sms_sent_at: new Date().toISOString() })
        .eq("id", hold.id);
    }

    return json({
      success: true,
      hold_id: hold.id,
      token: hold.token,
      held_until: hold.held_until,
      link,
      sms_sent: smsResult.ok,
      sms_error: smsResult.ok ? null : smsResult.error ?? null,
    });
  } catch (e) {
    console.error("[create-membership-hold] error", e);
    return json({ error: (e as Error).message || "Something went wrong" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
