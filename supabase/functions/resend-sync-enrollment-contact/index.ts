// Adds a single enrollment's parent to the relevant Resend audiences (class, period, level).
// Called fire-and-forget from payments-webhook and admin-create-enrollment after a row is inserted.
// If audiences don't exist yet, they're created on demand so new sessions/levels self-register.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { enrollmentId } = await req.json();
    if (!enrollmentId) return json({ error: "enrollmentId required" }, 400);

    const ctx = ctxFromEnv();

    const { data: enrollment, error: eErr } = await supabase
      .from("swim_enrollments")
      .select("id, session_id, swim_level, parent_email, parent_first_name, parent_last_name, parent_name")
      .eq("id", enrollmentId)
      .maybeSingle();
    if (eErr || !enrollment) return json({ error: "Enrollment not found" }, 404);
    if (!enrollment.parent_email) return json({ skipped: "no email" }, 200);

    const email = String(enrollment.parent_email).toLowerCase().trim();

    // Check unsubscribed
    const { data: contact } = await supabase
      .from("marketing_contacts")
      .select("subscribed")
      .ilike("email", email)
      .maybeSingle();
    if (contact && contact.subscribed === false) {
      return json({ skipped: "unsubscribed" }, 200);
    }

    // Load session + period
    let session: any = null;
    let period: any = null;
    if (enrollment.session_id) {
      const { data: s } = await supabase
        .from("swim_sessions")
        .select("id, session_name, swim_level, day_of_week, start_time, session_period_id, resend_audience_id")
        .eq("id", enrollment.session_id)
        .maybeSingle();
      session = s;
      if (s?.session_period_id) {
        const { data: p } = await supabase
          .from("session_periods")
          .select("id, name, resend_audience_id")
          .eq("id", s.session_period_id)
          .maybeSingle();
        period = p;
      }
    }

    // Ensure period audience
    if (period && !period.resend_audience_id) {
      try {
        const id = await createAudience(ctx, periodAudienceName(period.name));
        await supabase.from("session_periods").update({ resend_audience_id: id }).eq("id", period.id);
        period.resend_audience_id = id;
      } catch (e) {
        console.error("ensure period audience failed", e);
      }
    }

    // Ensure session audience
    if (session && !session.resend_audience_id) {
      try {
        const id = await createAudience(
          ctx,
          sessionAudienceName({
            session_name: session.session_name,
            swim_level: session.swim_level,
            day_of_week: session.day_of_week,
            start_time: session.start_time,
            period_name: period?.name ?? null,
          }),
        );
        await supabase.from("swim_sessions").update({ resend_audience_id: id }).eq("id", session.id);
        session.resend_audience_id = id;
      } catch (e) {
        console.error("ensure session audience failed", e);
      }
    }

    // Ensure level audience
    let levelAudId: string | null = null;
    const level = enrollment.swim_level;
    if (level) {
      const { data: row } = await supabase
        .from("resend_level_audiences")
        .select("resend_audience_id")
        .eq("level", level)
        .maybeSingle();
      if (row?.resend_audience_id) {
        levelAudId = row.resend_audience_id;
      } else {
        try {
          const id = await createAudience(ctx, levelAudienceName(level));
          await supabase.from("resend_level_audiences").insert({ level, resend_audience_id: id });
          levelAudId = id;
        } catch (e) {
          console.error("ensure level audience failed", e);
        }
      }
    }

    const firstName = enrollment.parent_first_name
      || (enrollment.parent_name ? String(enrollment.parent_name).split(" ")[0] : null);
    const lastName = enrollment.parent_last_name
      || (enrollment.parent_name && String(enrollment.parent_name).includes(" ")
        ? String(enrollment.parent_name).split(" ").slice(1).join(" ")
        : null);

    const targets = [session?.resend_audience_id, period?.resend_audience_id, levelAudId].filter(Boolean) as string[];

    const results: any[] = [];
    for (const aud of targets) {
      try {
        const r = await addContact(ctx, aud, email, { first_name: firstName, last_name: lastName });
        results.push({ audience: aud, ok: r.ok, status: r.status });
      } catch (e) {
        results.push({ audience: aud, ok: false, error: (e as Error).message });
      }
    }

    return json({ success: true, added_to: targets.length, results }, 200);
  } catch (e) {
    console.error("resend-sync-enrollment-contact error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
