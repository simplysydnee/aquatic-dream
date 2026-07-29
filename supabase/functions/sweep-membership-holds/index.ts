// Scheduled sweep for phone-booked membership holds.
//
// - ~24h after the hold was created: ONE reminder SMS, only if none was sent.
// - Past held_until: flip to 'expired'. Nothing is sent on expiry and no row
//   is ever deleted, so the front desk can still look up a walk-in family.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { formatPTTime, sendAndLogBookingConfirmation } from "../_shared/textmagic.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SITE_URL = "https://aquaticdreamsswim.com";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const REMINDER_AFTER_HOURS = 24;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    // 1. Expire everything past its window first, so we never remind on a dead hold.
    const { data: expired, error: expErr } = await supabase
      .from("membership_holds")
      .update({ status: "expired", expired_at: nowIso })
      .eq("status", "held")
      .lte("held_until", nowIso)
      .select("id");
    if (expErr) throw expErr;

    // 2. One reminder per hold, ever.
    const reminderCutoff = new Date(nowMs - REMINDER_AFTER_HOURS * 60 * 60 * 1000).toISOString();
    const { data: due, error: dueErr } = await supabase
      .from("membership_holds")
      .select("id, token, swimmer_name, parent_phone, held_until, standing_slot_id")
      .eq("status", "held")
      .is("reminder_sent_at", null)
      .lte("created_at", reminderCutoff)
      .gt("held_until", nowIso);
    if (dueErr) throw dueErr;

    let reminded = 0;
    for (const hold of due ?? []) {
      const { data: slot } = await supabase
        .from("standing_slots")
        .select("day_of_week, start_time")
        .eq("id", hold.standing_slot_id)
        .maybeSingle();

      const firstName = (hold.swimmer_name || "").split(/\s+/)[0] || hold.swimmer_name;
      const when = slot
        ? `${DAYS[slot.day_of_week] ?? ""} ${formatPTTime(slot.start_time)}`.trim()
        : "";
      const hoursLeft = Math.max(
        1,
        Math.round((new Date(hold.held_until).getTime() - nowMs) / (60 * 60 * 1000)),
      );
      const message =
        `Aquatic Dreams: ${firstName}'s ${when} spot is still held for about ${hoursLeft} more hrs. ` +
        `Finish here: ${SITE_URL}/join?hold=${hold.token}`;

      // Mark first: a send failure must never earn a second reminder.
      await supabase
        .from("membership_holds")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", hold.id);

      await sendAndLogBookingConfirmation(supabase, {
        phoneRaw: hold.parent_phone,
        message,
        swimmer_name: hold.swimmer_name,
        reminder_kind: "membership_hold_reminder",
      });
      reminded++;
    }

    return json({ expired: (expired ?? []).length, reminded });
  } catch (e) {
    console.error("[sweep-membership-holds] error", e);
    return json({ error: (e as Error).message || "Something went wrong" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
