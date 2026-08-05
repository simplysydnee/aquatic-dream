// Admin-only: send ONE signup text covering a batch of existing membership
// holds for the same parent phone. Creation and sending are separate steps —
// create-membership-hold can now create a hold with send_sms: false.
// No capacity logic, no level gate, no sweep behavior is touched here.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { formatPTTime, normalizePhone, sendAndLogBookingConfirmation } from "../_shared/textmagic.ts";

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
const EXTEND_HOURS = 48;

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
    const rawIds: unknown = body?.hold_ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return json({ error: "hold_ids must be a non-empty array" }, 400);
    }
    if (rawIds.length > 10) return json({ error: "Too many holds in one batch (max 10)" }, 400);
    const holdIds = Array.from(new Set(rawIds.map((v) => String(v))));

    const { data: holds, error: holdsErr } = await supabaseAdmin
      .from("membership_holds")
      .select(
        "id, token, status, swimmer_name, parent_phone, sms_sent_at, standing_slots:standing_slot_id (plan_key, day_of_week, start_time)",
      )
      .in("id", holdIds)
      .order("created_at", { ascending: true });
    if (holdsErr) {
      console.error("[send-membership-hold-invites] load failed", holdsErr);
      return json({ error: "Could not load holds" }, 500);
    }
    if (!holds || holds.length !== holdIds.length) {
      return json({ error: "One or more holds were not found" }, 404);
    }

    const notHeld = holds.filter((h) => h.status !== "held");
    if (notHeld.length > 0) {
      return json({
        error: "Every hold must still be held",
        offending: notHeld.map((h) => ({ hold_id: h.id, status: h.status })),
      }, 400);
    }

    const phones = new Set(holds.map((h) => normalizePhone(h.parent_phone) ?? ""));
    if (phones.size !== 1 || phones.has("")) {
      return json({ error: "All holds must share one valid parent phone" }, 400);
    }
    const phone = holds[0].parent_phone as string;

    const alreadySent = holds.filter((h) => h.sms_sent_at);
    const sendable = holds.filter((h) => !h.sms_sent_at);

    const skipped = alreadySent.map((h) => ({
      hold_id: h.id,
      swimmer_name: h.swimmer_name,
      status: "skipped_already_sent" as const,
      sms_sent_at: h.sms_sent_at,
    }));

    if (sendable.length === 0) {
      return json({
        success: true,
        sent: false,
        message: null,
        results: skipped,
        skipped,
        reason: "all_holds_already_sent",
      });
    }

    const nowIso = new Date().toISOString();
    const heldUntil = new Date(Date.now() + EXTEND_HOURS * 60 * 60 * 1000).toISOString();
    const sendableIds = sendable.map((h) => h.id);

    const { error: extErr } = await supabaseAdmin
      .from("membership_holds")
      .update({ held_until: heldUntil })
      .in("id", sendableIds);
    if (extErr) {
      console.error("[send-membership-hold-invites] extend failed", extErr);
      return json({ error: "Could not extend the holds" }, 500);
    }

    const parts = sendable.map((h) => {
      const slot = (h.standing_slots ?? null) as SlotShape | null;
      const first = String(h.swimmer_name || "").split(/\s+/)[0] || String(h.swimmer_name || "");
      const program = slot ? PLAN_LABELS[slot.plan_key] || "swim" : "swim";
      const when = slot
        ? `${DAYS[slot.day_of_week] ?? ""} ${formatPTTime(slot.start_time)}`.trim()
        : "";
      return when ? `${first} (${program}, ${when})` : `${first} (${program})`;
    });
    const list = parts.length === 1
      ? parts[0]
      : parts.length === 2
      ? `${parts[0]} and ${parts[1]}`
      : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;

    const link = `${SITE_URL}/join?hold=${sendable[0].token}`;
    const message =
      `Aquatic Dreams: we're holding ${parts.length === 1 ? "a spot" : "spots"} for ${list}. ` +
      `Finish enrollment within ${EXTEND_HOURS} hrs: ${link}`;

    const smsResult = await sendAndLogBookingConfirmation(supabaseAdmin, {
      phoneRaw: phone,
      message,
      swimmer_name: sendable.map((h) => h.swimmer_name).join(", "),
      reminder_kind: "membership_hold_invite",
    });

    if (!smsResult.ok) {
      return json({
        success: false,
        sent: false,
        message,
        error: smsResult.error ?? "sms_failed",
        results: [
          ...sendable.map((h) => ({
            hold_id: h.id,
            swimmer_name: h.swimmer_name,
            status: "failed" as const,
            held_until: heldUntil,
          })),
          ...skipped,
        ],
        skipped,
      }, 502);
    }

    const { error: stampErr } = await supabaseAdmin
      .from("membership_holds")
      .update({ sms_sent_at: nowIso })
      .in("id", sendableIds);
    if (stampErr) {
      console.error("[send-membership-hold-invites] stamp failed", stampErr);
    }

    return json({
      success: true,
      sent: true,
      message,
      results: [
        ...sendable.map((h) => ({
          hold_id: h.id,
          swimmer_name: h.swimmer_name,
          status: "sent" as const,
          held_until: heldUntil,
        })),
        ...skipped,
      ],
      skipped,
    });
  } catch (e) {
    console.error("[send-membership-hold-invites] error", e);
    return json({ error: (e as Error).message || "Something went wrong" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
