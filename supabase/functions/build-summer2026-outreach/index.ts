// Admin-only report for the one-time summer 2026 to fall Swimbership announcement.
// Builds the audience and the exact rendered messages. Sends nothing, writes nothing.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildSummer2026List, SUMMER2026_KIND } from "../_shared/summer2026-outreach.ts";
import { loadOptOutPhones, optOutPhoneKey } from "../_shared/sms-opt-out.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

    const list = await buildSummer2026List(supabaseAdmin);

    const { data: alreadySent } = await supabaseAdmin
      .from("reminder_logs")
      .select("phone")
      .eq("reminder_kind", SUMMER2026_KIND)
      .eq("status", "sent");
    const sentPhones = new Set(
      (alreadySent ?? []).map((r: { phone: string | null }) => (r.phone ?? "").replace(/\D/g, "").slice(-10)),
    );

    const samples = (segment: string) =>
      list.recipients.filter((r) => r.segment === segment).slice(0, 5).map((r) => r.message);

    return json({
      counts: list.counts,
      already_sent: list.recipients.filter((r) => sentPhones.has(r.phone)).length,
      excluded_active_member_phones: list.excludedMemberPhones,
      samples: { GROUP: samples("GROUP"), PRIVATE: samples("PRIVATE"), BOTH: samples("BOTH") },
      recipients: list.recipients,
      no_phone: list.excluded.filter((e) => e.reason === "no_phone"),
      unusable_name: list.excluded.filter((e) => e.reason === "unusable_name"),
    });
  } catch (e) {
    console.error("[build-summer2026-outreach]", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
