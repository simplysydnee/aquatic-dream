// Public edge function: a family hits a full membership time on /join and asks
// to be put on the waitlist. We save the row server-side, email the parent a
// confirmation, and alert the office so somebody actually follows up.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const OWNER_EMAIL = "info@aquaticdreamsswim.com";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PLAN_NAMES: Record<string, string> = {
  kid_group: "Small Group Swim",
  private: "Private Swim",
  adult_group: "Adult Swim",
};

interface Body {
  planKey: string;
  standingSlotId?: string | null;
  swimLevel?: string | null;
  preferredDay?: number | null;
  preferredTime?: string | null;
  swimmerName: string;
  parentName: string;
  parentEmail: string;
  parentPhone?: string | null;
  notes?: string | null;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const fmtTime = (t: string | null | undefined): string | null => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const period = h >= 12 ? "pm" : "am";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, "0")}${period}`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;

    const required: (keyof Body)[] = ["planKey", "swimmerName", "parentName", "parentEmail"];
    for (const k of required) {
      if (!body[k] || String(body[k]).trim().length === 0) {
        return json({ error: `Missing required field: ${k}` }, 400);
      }
    }
    if (!PLAN_NAMES[body.planKey]) {
      return json({ error: "Invalid planKey" }, 400);
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.parentEmail)) {
      return json({ error: "Invalid email" }, 400);
    }

    // Slot details for the emails (day, time, instructor)
    let instructorName: string | null = null;
    let day = body.preferredDay ?? null;
    let time = body.preferredTime ?? null;
    if (body.standingSlotId) {
      const { data: slot } = await supabaseAdmin
        .from("standing_slots")
        .select("day_of_week, start_time, instructor_name")
        .eq("id", body.standingSlotId)
        .maybeSingle();
      if (slot) {
        instructorName = slot.instructor_name ?? null;
        day = day ?? slot.day_of_week;
        time = time ?? slot.start_time;
      }
    }

    const { data: row, error: insErr } = await supabaseAdmin
      .from("membership_waitlist")
      .insert({
        plan_key: body.planKey,
        standing_slot_id: body.standingSlotId || null,
        swim_level: body.swimLevel || null,
        preferred_day: day,
        preferred_time: time,
        swimmer_name: body.swimmerName.trim(),
        parent_name: body.parentName.trim(),
        parent_email: body.parentEmail.trim(),
        parent_phone: body.parentPhone?.trim() || "",
        notes: body.notes?.trim() || null,
        status: "open",
      })
      .select("id")
      .single();

    if (insErr || !row) {
      console.error("membership waitlist insert failed", insErr);
      return json({ error: insErr?.message || "Insert failed" }, 500);
    }

    const programName = PLAN_NAMES[body.planKey];
    const requestedTime = day !== null && day !== undefined && fmtTime(time)
      ? `${DAYS[day]} ${fmtTime(time)}`
      : "Any time";
    const parentFirstName = body.parentName.trim().split(/\s+/)[0];
    const submittedAt = new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
    });

    // Parent confirmation
    try {
      const { error: e1 } = await supabaseAdmin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "membership-waitlist-confirmation",
          recipientEmail: body.parentEmail.trim(),
          idempotencyKey: `membership-waitlist-${row.id}`,
          templateData: {
            parentFirstName,
            swimmerName: body.swimmerName.trim(),
            programName,
            requestedTime,
            instructorName: instructorName || undefined,
            swimLevel: body.swimLevel || undefined,
          },
        },
      });
      if (e1) console.error("parent membership waitlist email failed", e1);
    } catch (e) {
      console.error("parent membership waitlist email exception", e);
    }

    // Owner alert
    try {
      const { error: e2 } = await supabaseAdmin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "internal-membership-waitlist-alert",
          recipientEmail: OWNER_EMAIL,
          idempotencyKey: `membership-waitlist-owner-${row.id}`,
          templateData: {
            parentName: body.parentName.trim(),
            parentEmail: body.parentEmail.trim(),
            parentPhone: body.parentPhone?.trim() || undefined,
            swimmerName: body.swimmerName.trim(),
            programName,
            requestedTime,
            instructorName: instructorName || undefined,
            swimLevel: body.swimLevel || undefined,
            notes: body.notes?.trim() || undefined,
            submittedAt,
          },
        },
      });
      if (e2) console.error("owner membership waitlist email failed", e2);
    } catch (e) {
      console.error("owner membership waitlist email exception", e);
    }

    return json({ success: true, id: row.id }, 200);
  } catch (e) {
    console.error("submit-membership-waitlist error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
