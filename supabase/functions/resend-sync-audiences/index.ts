import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  ctxFromEnv,
  createAudience,
  addContact,
  sessionAudienceName,
  periodAudienceName,
  levelAudienceName,
} from "../_shared/resend-audiences.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const ACTIVE_STATUSES = ["pending", "confirmed", "enrolled", "pending_payment"];
const LEVELS = ["white", "red", "yellow", "blue", "green"];

async function requireAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  if (!auth) return false;
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!(await requireAdmin(req))) {
      return json({ error: "Admin only" }, 403);
    }

    const ctx = ctxFromEnv();
    const result = {
      periods_created: 0,
      sessions_created: 0,
      levels_created: 0,
      contacts_added: 0,
      contact_errors: 0,
      errors: [] as string[],
    };

    // -------- 1. Periods --------
    const { data: periods = [] } = await supabase
      .from("session_periods")
      .select("id, name, resend_audience_id, is_active")
      .eq("is_active", true);

    for (const p of periods!) {
      if (!p.resend_audience_id) {
        try {
          const id = await createAudience(ctx, periodAudienceName(p.name));
          await supabase.from("session_periods").update({ resend_audience_id: id }).eq("id", p.id);
          p.resend_audience_id = id;
          result.periods_created++;
        } catch (e) {
          result.errors.push(`Period ${p.name}: ${(e as Error).message}`);
        }
      }
    }

    // -------- 2. Sessions --------
    const { data: sessions = [] } = await supabase
      .from("swim_sessions")
      .select("id, session_name, swim_level, day_of_week, start_time, session_period_id, resend_audience_id, is_active")
      .eq("is_active", true);

    const periodById = new Map(periods!.map((p) => [p.id, p]));

    for (const s of sessions!) {
      if (!s.resend_audience_id) {
        try {
          const period = s.session_period_id ? periodById.get(s.session_period_id) : null;
          const id = await createAudience(
            ctx,
            sessionAudienceName({
              session_name: s.session_name,
              swim_level: s.swim_level,
              day_of_week: s.day_of_week,
              start_time: s.start_time,
              period_name: period?.name ?? null,
            }),
          );
          await supabase.from("swim_sessions").update({ resend_audience_id: id }).eq("id", s.id);
          s.resend_audience_id = id;
          result.sessions_created++;
        } catch (e) {
          result.errors.push(`Session ${s.id}: ${(e as Error).message}`);
        }
      }
    }

    // -------- 3. Levels --------
    const { data: levelRows = [] } = await supabase
      .from("resend_level_audiences")
      .select("level, resend_audience_id");
    const levelMap = new Map<string, string>((levelRows || []).map((r) => [r.level, r.resend_audience_id]));

    for (const level of LEVELS) {
      if (!levelMap.has(level)) {
        try {
          const id = await createAudience(ctx, levelAudienceName(level));
          await supabase.from("resend_level_audiences").insert({ level, resend_audience_id: id });
          levelMap.set(level, id);
          result.levels_created++;
        } catch (e) {
          result.errors.push(`Level ${level}: ${(e as Error).message}`);
        }
      }
    }

    // -------- 4. Backfill enrollments --------
    const sessionById = new Map(sessions!.map((s) => [s.id, s]));

    const { data: enrollments = [] } = await supabase
      .from("swim_enrollments")
      .select("id, session_id, swim_level, parent_email, parent_first_name, parent_last_name, parent_name, status")
      .in("status", ACTIVE_STATUSES);

    // Look up suppressed (unsubscribed) marketing contacts
    const { data: unsubs = [] } = await supabase
      .from("marketing_contacts")
      .select("email")
      .eq("subscribed", false);
    const unsubSet = new Set((unsubs || []).map((u) => String(u.email).toLowerCase()));

    for (const e of enrollments!) {
      if (!e.parent_email) continue;
      const email = String(e.parent_email).toLowerCase().trim();
      if (unsubSet.has(email)) continue;

      const session = e.session_id ? sessionById.get(e.session_id) : null;
      const periodAudId = session?.session_period_id
        ? periodById.get(session.session_period_id)?.resend_audience_id
        : null;
      const levelAudId = e.swim_level ? levelMap.get(e.swim_level) : null;

      const targets = [session?.resend_audience_id, periodAudId, levelAudId].filter(Boolean) as string[];

      const firstName = e.parent_first_name || (e.parent_name ? String(e.parent_name).split(" ")[0] : null);
      const lastName = e.parent_last_name
        || (e.parent_name && String(e.parent_name).includes(" ")
          ? String(e.parent_name).split(" ").slice(1).join(" ")
          : null);

      for (const aud of targets) {
        try {
          const r = await addContact(ctx, aud, email, { first_name: firstName, last_name: lastName });
          if (r.ok) result.contacts_added++;
          else result.contact_errors++;
        } catch {
          result.contact_errors++;
        }
      }
    }

    return json({ success: true, ...result }, 200);
  } catch (e) {
    console.error("resend-sync-audiences error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
