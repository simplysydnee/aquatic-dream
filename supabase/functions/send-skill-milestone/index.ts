// Sends a one-time celebration SMS when a swimmer hits 3/6 or 6/6 in a level.
//
// Duplicate protection is the UNIQUE constraint on
// skill_milestone_sends (swimmer_id, swim_level, milestone): we insert BEFORE
// sending, and a conflict means the family was already told.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { isCronAuthorized } from "../_shared/cron-guard.ts";
import { normalizePhone, sendSms } from "../_shared/textmagic.ts";
import { loadOptOutPhones, optOutPhoneKey } from "../_shared/sms-opt-out.ts";

const LEVEL_GROUP_NAMES: Record<string, string> = {
  white: "Little Fins",
  red: "Reef Explorers",
  yellow: "Sea Scouts",
  blue: "Deep Sea Divers",
  green: "Ocean Masters",
};

const SITE_URL = "https://aquaticdreamsswim.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Body {
  swimmer_id?: string;
  swim_level?: string;
  milestone?: "halfway" | "mastered";
  instructor_id?: string;
  dryRun?: boolean;
}

/** Admin JWT, service role / cron secret, or a staff-mode kiosk caller. */
async function isAuthorized(req: Request, supabaseUrl: string, anonKey: string, serviceKey: string) {
  if (isCronAuthorized(req)) return true;
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return false;
  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return false;

    // Kiosk accounts are authenticated but not admin.
    const { data: staffOk } = await userClient.rpc("can_use_staff_mode");
    if (staffOk === true) return true;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    return !!roleRow;
  } catch (e) {
    console.error("auth check failed", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  if (!(await isAuthorized(req, supabaseUrl, anonKey, serviceKey))) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const swimmerId = body.swimmer_id;
  const swimLevel = body.swim_level;
  const milestone = body.milestone;
  const dryRun = body.dryRun === true;

  if (!swimmerId || !swimLevel || (milestone !== "halfway" && milestone !== "mastered")) {
    return json({ error: "swimmer_id, swim_level and milestone are required" }, 400);
  }
  if (!LEVEL_GROUP_NAMES[swimLevel]) return json({ error: "Unknown swim_level" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  // 1. Recompute the mastered count server side. Never trust the client.
  const { data: defs, error: defErr } = await admin
    .from("skill_definitions")
    .select("id")
    .eq("swim_level", swimLevel)
    .eq("is_active", true);
  if (defErr) return json({ error: defErr.message }, 500);
  const defIds = (defs ?? []).map((d: { id: string }) => d.id);

  const { data: metRows, error: metErr } = await admin
    .from("swimmer_skills")
    .select("skill_definition_id, state")
    .eq("swimmer_id", swimmerId)
    .eq("state", "met")
    .in("skill_definition_id", defIds.length ? defIds : ["00000000-0000-0000-0000-000000000000"]);
  if (metErr) return json({ error: metErr.message }, 500);

  const masteredCount = (metRows ?? []).length;
  const expected = milestone === "mastered" ? 6 : 3;
  if (masteredCount !== expected) {
    return json(
      { error: "milestone_mismatch", mastered: masteredCount, expected, sent: 0 },
      409,
    );
  }

  const { data: swimmer, error: swimmerErr } = await admin
    .from("swimmers")
    .select("id, first_name, share_token")
    .eq("id", swimmerId)
    .maybeSingle();
  if (swimmerErr) return json({ error: swimmerErr.message }, 500);
  if (!swimmer) return json({ error: "Swimmer not found" }, 404);

  const levelName = LEVEL_GROUP_NAMES[swimLevel];
  const chartUrl = `${SITE_URL}/swimmer/${swimmer.share_token}`;
  const message =
    milestone === "halfway"
      ? `${swimmer.first_name} is halfway through ${levelName}! See what they've mastered: ${chartUrl}`
      : `${swimmer.first_name} mastered every ${levelName} skill! ${chartUrl}`;

  // Recipients: consented, deduped, opt-out filtered.
  const { data: memberships, error: memErr } = await admin
    .from("memberships")
    .select("parent_phone, sms_consent, status")
    .eq("swimmer_id", swimmerId)
    .in("status", ["active", "pending_cancel", "paused"]);
  if (memErr) return json({ error: memErr.message }, 500);

  const optOuts = await loadOptOutPhones(admin);
  const phones: string[] = [];
  for (const m of memberships ?? []) {
    if (m.sms_consent !== true) continue; // fail closed on NULL
    const phone = normalizePhone(m.parent_phone);
    if (!phone) continue;
    const key = optOutPhoneKey(phone);
    if (key && optOuts.has(key)) continue;
    if (!phones.includes(phone)) phones.push(phone);
  }

  // 2. Dry run: nothing is written, nothing is sent.
  if (dryRun) {
    return json({
      dryRun: true,
      mastered: masteredCount,
      would_send: phones.map((p) => ({ phone_last4: p.slice(-4), message })),
    });
  }

  if (phones.length === 0) {
    // Still claim the milestone so it is not retried blindly.
    const { error: insErr } = await admin
      .from("skill_milestone_sends")
      .insert({
        swimmer_id: swimmerId,
        swim_level: swimLevel,
        milestone,
        status: "no_recipient",
      });
    if (insErr && insErr.code === "23505") return json({ alreadySent: true, sent: 0 });
    return json({ sent: 0, reason: "no eligible recipient" });
  }

  // 3. Insert BEFORE sending. A conflict means we stop and send nothing.
  const { data: sendRow, error: insertErr } = await admin
    .from("skill_milestone_sends")
    .insert({ swimmer_id: swimmerId, swim_level: swimLevel, milestone, status: "pending" })
    .select("id")
    .single();
  if (insertErr) {
    if (insertErr.code === "23505") return json({ alreadySent: true, sent: 0 });
    return json({ error: insertErr.message }, 500);
  }

  // 4. Send, then stamp the row. Failures leave the row so retry is deliberate.
  let sent = 0;
  const errors: string[] = [];
  for (const phone of phones) {
    const res = await sendSms(phone, message, {
      admin,
      kind: "other",
      sentByLabel: "System - skill milestone",
    });
    if (res.ok) sent += 1;
    else errors.push(`${phone.slice(-4)}: ${res.error ?? "send failed"}`);
  }

  await admin
    .from("skill_milestone_sends")
    .update({
      sent_at: sent > 0 ? new Date().toISOString() : null,
      status: sent > 0 ? (errors.length ? "partial" : "sent") : "failed",
      phone: phones.join(","),
      error: errors.length ? errors.join("; ") : null,
    })
    .eq("id", sendRow.id);

  if (sent === 0) return json({ sent: 0, error: errors.join("; ") || "send failed" }, 502);
  return json({ sent, recipients: phones.length, errors: errors.length ? errors : undefined });
});
