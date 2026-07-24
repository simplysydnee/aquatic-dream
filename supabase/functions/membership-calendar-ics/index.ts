// Public endpoint: returns an .ics calendar for a membership's scheduled
// lessons from today through the end of NEXT calendar month.
// Auth: membership manage_token (query param `token`).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_NAMES: Record<string, string> = {
  kid_group: "Small Group Swim",
  private: "Private Swim",
  adult_group: "Adult Swim",
};

const DEFAULT_LOCATION = "1212 Kansas Ave, Modesto, CA 95351";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

// Convert PT wall-clock date+time to a UTC ICS timestamp.
function ptWallClockToUtc(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const parts = timeStr.split(":").map(Number);
  const hh = parts[0] || 0;
  const mm = parts[1] || 0;
  const ss = parts[2] || 0;

  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "shortOffset",
  });
  const tzPart = fmt.formatToParts(probe).find((p) => p.type === "timeZoneName")?.value || "GMT-8";
  const offsetMatch = tzPart.match(/GMT([+-]\d+)/);
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1], 10) : -8;

  const utcMs = Date.UTC(y, m - 1, d, hh - offsetHours, mm, ss);
  const u = new Date(utcMs);
  return `${u.getUTCFullYear()}${pad(u.getUTCMonth() + 1)}${pad(u.getUTCDate())}T${pad(u.getUTCHours())}${pad(u.getUTCMinutes())}${pad(u.getUTCSeconds())}Z`;
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function todayInPT(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

function endOfNextMonthPT(): string {
  const today = todayInPT();
  const [y, m] = today.split("-").map(Number);
  // Last day of next month = day 0 of month after next
  const last = new Date(Date.UTC(y, m + 1, 0));
  return `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: m, error: mErr } = await supabase
      .from("memberships")
      .select("id, plan_key, child_first_name, standing_slot_id")
      .eq("manage_token", token)
      .maybeSingle();

    if (mErr || !m) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let location = DEFAULT_LOCATION;
    if (m.standing_slot_id) {
      const { data: slot } = await supabase
        .from("standing_slots")
        .select("location")
        .eq("id", m.standing_slot_id)
        .maybeSingle();
      if (slot?.location) location = slot.location;
    }

    const fromDate = todayInPT();
    const toDate = endOfNextMonthPT();

    const { data: occs, error: oErr } = await supabase
      .from("membership_occurrences")
      .select("id, occurrence_date, start_time, end_time, status")
      .eq("membership_id", m.id)
      .eq("status", "scheduled")
      .gte("occurrence_date", fromDate)
      .lte("occurrence_date", toDate)
      .order("occurrence_date", { ascending: true });

    if (oErr) {
      return new Response(JSON.stringify({ error: oErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const planName = PLAN_NAMES[m.plan_key as string] || "Swim Lesson";
    const childName = (m.child_first_name || "Swimmer").toString();
    const summary = `${childName} — ${planName} (Aquatic Dreams)`;
    const dtStamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Aquatic Dreams//Membership Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    for (const o of occs || []) {
      if (!o.start_time || !o.end_time) continue;
      const dtStart = ptWallClockToUtc(o.occurrence_date as string, o.start_time as string);
      const dtEnd = ptWallClockToUtc(o.occurrence_date as string, o.end_time as string);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${o.id}@aquaticdreams`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${escapeIcs(summary)}`,
        `LOCATION:${escapeIcs(location)}`,
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeIcs(summary)}`,
        "TRIGGER:-PT60M",
        "END:VALARM",
        "END:VEVENT",
      );
    }

    lines.push("END:VCALENDAR");
    const body = lines.join("\r\n");

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="aquatic-dreams-lessons.ics"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[membership-calendar-ics] error", e);
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
