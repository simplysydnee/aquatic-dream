// Admin-only: manually resend the signup text for ONE live membership hold.
// Deliberate human action, separate from the automatic 24h sweep reminder:
// this never touches reminder_sent_at, sms_sent_at, or held_until.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { formatHoldWindow, formatPTTime, sendAndLogBookingConfirmation } from "../_shared/textmagic.ts";

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
const RATE_LIMIT_MINUTES = 30;

interface SlotShape {
  plan_key: string;
  day_of_week: number;
  start_time: string;
}

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
    const holdId = String(body?.hold_id || "");
    const preview = body?.preview === true;
    if (!holdId) return json({ error: "hold_id required" }, 400);

    const { data: hold, error: holdErr } = await supabaseAdmin
      .from("membership_holds")
      .select(
        "id, token, group_token, status, swimmer_name, parent_phone, held_until, last_manual_reminder_at, standing_slots:standing_slot_id (plan_key, day_of_week, start_time)",
      )
      .eq("id", holdId)
      .maybeSingle();
    if (holdErr) {
      console.error("[send-membership-hold-reminder] load failed", holdErr);
      return json({ error: "Could not load the hold" }, 500);
    }
    if (!hold) return json({ error: "Hold not found" }, 404);
    if (hold.status !== "held") {
      return json({ error: `This hold is ${hold.status}, so no reminder was sent.` }, 400);
    }

    const nowMs = Date.now();
    const heldUntilMs = new Date(hold.held_until as string).getTime();
    if (!(heldUntilMs > nowMs)) {
      return json({ error: "This hold has already expired, so no reminder was sent." }, 400);
    }

    if (hold.last_manual_reminder_at) {
      const sinceMin = (nowMs - new Date(hold.last_manual_reminder_at as string).getTime()) / 60000;
      if (sinceMin < RATE_LIMIT_MINUTES) {
        const ago = Math.max(1, Math.round(sinceMin));
        const wait = Math.max(1, Math.ceil(RATE_LIMIT_MINUTES - sinceMin));
        return json({
          error:
            `A reminder already went out ${ago} min ago. Try again in ${wait} min.`,
          rate_limited: true,
          last_manual_reminder_at: hold.last_manual_reminder_at,
        }, 429);
      }
    }

    const slot = (hold.standing_slots ?? null) as SlotShape | null;
    const swimmerName = String(hold.swimmer_name || "");
    const firstName = swimmerName.split(/\s+/)[0] || swimmerName;
    const program = slot ? PLAN_LABELS[slot.plan_key] || "swim" : "swim";
    const when = slot
      ? `${DAYS[slot.day_of_week] ?? ""} ${formatPTTime(slot.start_time)}`.trim()
      : "";
    const link = `${SITE_URL}/join?hold=${hold.group_token || hold.token}`;
    const remainingMinutes = Math.round((heldUntilMs - nowMs) / 60000);
    const message =
      `Aquatic Dreams: we're holding a ${program} spot for ${firstName}${when ? `, ${when}` : ""}. ` +
      `Finish enrollment within ${formatHoldWindow(remainingMinutes)}: ${link}`;

    // Preview mode: everything above runs (status, expiry, rate limit,
    // composition) but nothing is sent and nothing is stamped.
    if (preview) {
      return json({ success: true, preview: true, sent: false, message, hold_id: hold.id });
    }

    const smsResult = await sendAndLogBookingConfirmation(supabaseAdmin, {
      phoneRaw: hold.parent_phone as string,
      message,
      swimmer_name: swimmerName,
      reminder_kind: "membership_hold_manual_reminder",
    });

    if (!smsResult.ok) {
      return json({
        success: false,
        sent: false,
        message,
        error: smsResult.error ?? "sms_failed",
      }, 502);
    }

    const sentAt = new Date().toISOString();
    const { error: stampErr } = await supabaseAdmin
      .from("membership_holds")
      .update({ last_manual_reminder_at: sentAt })
      .eq("id", hold.id);
    if (stampErr) {
      console.error("[send-membership-hold-reminder] stamp failed", stampErr);
    }

    return json({
      success: true,
      sent: true,
      message,
      hold_id: hold.id,
      last_manual_reminder_at: sentAt,
    });
  } catch (e) {
    console.error("[send-membership-hold-reminder] error", e);
    return json({ error: (e as Error).message || "Something went wrong" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
