// Public edge function: parent hits a full session, lands on the friendly
// "session full" screen. We save a waitlist row, email the parent a friendly
// confirmation (with the promo private-lesson option), and email the owner an
// internal alert so they can act on the demand.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PRIVATE_PROMO_PRICE, PROMO_LABEL } from "../_shared/private-lesson-pricing.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const OWNER_EMAIL = "info@aquaticdreamsswim.com";

interface Body {
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  parentPhone?: string | null;
  childFirstName: string;
  childLastName: string;
  childAge?: number | null;
  swimLevel?: string | null;
  sessionId?: string | null;
  sourcePage?: string | null;
  notes?: string | null;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;

    // Validation
    const required: (keyof Body)[] = [
      "parentFirstName",
      "parentLastName",
      "parentEmail",
      "childFirstName",
      "childLastName",
    ];
    for (const k of required) {
      if (!body[k] || String(body[k]).trim().length === 0) {
        return json({ error: `Missing required field: ${k}` }, 400);
      }
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.parentEmail)) {
      return json({ error: "Invalid email" }, 400);
    }

    // Look up session name if we have an id (for the email body)
    let sessionName: string | null = null;
    if (body.sessionId) {
      const { data: s } = await supabaseAdmin
        .from("swim_sessions")
        .select("session_name, day_of_week, start_time")
        .eq("id", body.sessionId)
        .maybeSingle();
      if (s) {
        sessionName = [s.session_name, s.day_of_week, s.start_time]
          .filter(Boolean)
          .join(" · ");
      }
    }

    // Insert waitlist row
    const { data: row, error: insErr } = await supabaseAdmin
      .from("waitlist_requests")
      .insert({
        parent_first_name: body.parentFirstName.trim(),
        parent_last_name: body.parentLastName.trim(),
        parent_email: body.parentEmail.trim(),
        parent_phone: body.parentPhone?.trim() || null,
        child_first_name: body.childFirstName.trim(),
        child_last_name: body.childLastName.trim(),
        child_age: body.childAge ?? null,
        swim_level: body.swimLevel || null,
        session_id: body.sessionId || null,
        source_page: body.sourcePage || null,
        notes: body.notes || null,
        status: "new",
      })
      .select("id")
      .single();

    if (insErr || !row) {
      console.error("waitlist insert failed", insErr);
      return json({ error: insErr?.message || "Insert failed" }, 500);
    }

    const parentName = `${body.parentFirstName} ${body.parentLastName}`.trim();
    const childName = `${body.childFirstName} ${body.childLastName}`.trim();
    const submittedAt = new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
    });

    // Parent confirmation
    try {
      const { error: e1 } = await supabaseAdmin.functions.invoke(
        "send-transactional-email",
        {
          body: {
            templateName: "waitlist-confirmation",
            recipientEmail: body.parentEmail.trim(),
            idempotencyKey: `waitlist-${row.id}`,
            templateData: {
              parentFirstName: body.parentFirstName,
              childFirstName: body.childFirstName,
              swimLevel: body.swimLevel || undefined,
              sessionName: sessionName || undefined,
              privateLessonPriceUsd: PRIVATE_PROMO_PRICE,
              promoLabel: PROMO_LABEL,
            },
          },
        },
      );
      if (e1) console.error("parent waitlist email failed", e1);
    } catch (e) {
      console.error("parent waitlist email exception", e);
    }

    // Owner alert
    try {
      const { error: e2 } = await supabaseAdmin.functions.invoke(
        "send-transactional-email",
        {
          body: {
            templateName: "waitlist-owner-alert",
            recipientEmail: OWNER_EMAIL,
            idempotencyKey: `waitlist-owner-${row.id}`,
            templateData: {
              parentName,
              parentEmail: body.parentEmail,
              parentPhone: body.parentPhone || undefined,
              childName,
              childAge: body.childAge ?? undefined,
              swimLevel: body.swimLevel || undefined,
              sessionName: sessionName || undefined,
              notes: body.notes || undefined,
              submittedAt,
            },
          },
        },
      );
      if (e2) console.error("owner waitlist email failed", e2);
    } catch (e) {
      console.error("owner waitlist email exception", e);
    }

    return json({ success: true, id: row.id }, 200);
  } catch (e) {
    console.error("submit-waitlist-request error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
