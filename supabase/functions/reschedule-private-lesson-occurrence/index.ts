// Admin: reschedule one or more private/semi-private lesson occurrences to
// other open slots. Supports three modes:
//   - "one"        : single occurrence moved to a new date/time (and optional new instructor)
//   - "remaining"  : every future non-cancelled occurrence in the series is re-laid onto a
//                    new weekday at a new time with a new (or same) instructor
//   - "instructor" : keep date/time, just change the instructor for the targeted occurrence(s)
//
// Payment status stays attached to each moved occurrence. Parent always receives an updated
// confirmation email via send-transactional-email (template: private-lesson-rescheduled).
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TimeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const BodySchema = z.object({
  booking_id: z.string().uuid(),
  mode: z.enum(["one", "remaining", "instructor"]),
  occurrence_id: z.string().uuid().optional(),
  new_date: DateStr.optional(),
  new_start: TimeStr.optional(),
  new_end: TimeStr.optional(),
  new_instructor_id: z.string().uuid().nullable().optional(),
  new_instructor_name: z.string().min(1).optional(),
  pool_area: z.string().optional(),
  reason: z.string().max(500).optional(),
  notify: z.boolean().optional().default(true),
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const norm = (t: string) => t.slice(0, 5);
const fmtTimeLabel = (t: string) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
};
const fmtDateLabel = (d: string) =>
  new Date(d + "T00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

async function validateSlot(opts: {
  date: string;
  start: string;
  end: string;
  instructor_id: string;
  pool_area: string;
  ignore_occurrence_ids: string[];
}) {
  const { date, start, end, instructor_id, pool_area, ignore_occurrence_ids } = opts;
  const sMin = toMin(start);
  const eMin = toMin(end);
  if (eMin <= sMin) return "Invalid time range";

  // NOTE: Admin overrides intentionally do NOT require a published shift —
  // admins reschedule outside the published schedule all the time. We still
  // enforce real conflicts (pool area + overlapping lessons) below.


  // 2) no conflicting pool_events in same area
  const { data: events } = await supabaseAdmin
    .from("pool_events")
    .select("start_time, end_time, pool_area")
    .eq("event_date", date);
  const conflictPool = (events || []).some((e: any) => {
    if (e.pool_area !== pool_area && e.pool_area !== "full" && pool_area !== "full") return false;
    const es = toMin(norm(e.start_time));
    const ee = toMin(norm(e.end_time));
    return sMin < ee && eMin > es;
  });
  if (conflictPool) return `Pool area ${pool_area} is already booked at ${fmtTimeLabel(start)} on ${fmtDateLabel(date)}`;

  // 3) no overlapping other lesson occurrences for same instructor at same date/time
  const { data: occs } = await supabaseAdmin
    .from("lesson_booking_occurrences")
    .select("id, occurrence_date, status, start_time_override, end_time_override, instructor_override_id, lesson_bookings!inner(instructor_id, start_time, end_time)")
    .eq("occurrence_date", date)
    .neq("status", "cancelled");
  const conflictLesson = (occs || []).some((o: any) => {
    if (ignore_occurrence_ids.includes(o.id)) return false;
    const instId = o.instructor_override_id || o.lesson_bookings?.instructor_id;
    if (instId !== instructor_id) return false;
    const oStart = toMin(norm(o.start_time_override || o.lesson_bookings?.start_time || "00:00"));
    const oEnd = toMin(norm(o.end_time_override || o.lesson_bookings?.end_time || "00:00"));
    return sMin < oEnd && eMin > oStart;
  });
  if (conflictLesson) return `Instructor already has another lesson overlapping ${fmtTimeLabel(start)} on ${fmtDateLabel(date)}`;

  return null;
}

function nextWeekdayOnOrAfter(fromIso: string, weekday: number) {
  const d = new Date(fromIso + "T00:00");
  const cur = d.getDay();
  const diff = (weekday - cur + 7) % 7;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDaysIso(iso: string, days: number) {
  const d = new Date(iso + "T00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return j({ error: "Missing Authorization header" }, 401);
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) return j({ error: "Invalid auth token" }, 401);
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: userData.user.id, _role: "admin",
    });
    if (!isAdmin) return j({ error: "Admin role required" }, 403);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return j({ error: parsed.error.flatten() }, 400);
    const body = parsed.data;

    // Load booking + occurrences
    const { data: booking, error: bErr } = await supabaseAdmin
      .from("lesson_bookings")
      .select("*, lesson_booking_occurrences(id, occurrence_date, status, start_time_override, end_time_override, instructor_override_id, instructor_override_name)")
      .eq("id", body.booking_id)
      .maybeSingle();
    if (bErr) throw bErr;
    if (!booking) return j({ error: "Booking not found" }, 404);

    const baseInstructorId: string | null = (booking as any).instructor_id;
    const baseInstructorName: string | null = (booking as any).instructor_name;
    const baseStart = norm((booking as any).start_time || "00:00");
    const baseEnd = norm((booking as any).end_time || "00:00");
    const lengthMin = toMin(baseEnd) - toMin(baseStart);
    const poolArea = body.pool_area || "shallow";
    const todayIso = new Date().toISOString().slice(0, 10);

    const movedSummary: any[] = [];

    if (body.mode === "one" || body.mode === "instructor") {
      if (!body.occurrence_id) return j({ error: "occurrence_id required" }, 400);
      const occ = (booking as any).lesson_booking_occurrences.find(
        (o: any) => o.id === body.occurrence_id,
      );
      if (!occ) return j({ error: "Occurrence not found on this booking" }, 404);
      if (occ.status === "cancelled") return j({ error: "Cannot reschedule a cancelled occurrence" }, 400);

      const newInstructorId = body.new_instructor_id ?? (occ.instructor_override_id || baseInstructorId);
      const newInstructorName = body.new_instructor_name || occ.instructor_override_name || baseInstructorName || "";
      if (!newInstructorId) return j({ error: "Instructor required" }, 400);

      const newDate = body.mode === "one" ? (body.new_date || occ.occurrence_date) : occ.occurrence_date;
      const newStart = body.mode === "one" ? norm(body.new_start || baseStart) : baseStart;
      const newEnd = body.mode === "one"
        ? norm(body.new_end || (() => {
            // derive from start + length
            const total = toMin(norm(body.new_start || baseStart)) + lengthMin;
            return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
          })())
        : baseEnd;

      const err = await validateSlot({
        date: newDate, start: newStart, end: newEnd,
        instructor_id: newInstructorId, pool_area: poolArea,
        ignore_occurrence_ids: [occ.id],
      });
      if (err) return j({ error: err }, 409);

      const update: any = { updated_at: new Date().toISOString() };
      if (body.mode === "one") {
        update.occurrence_date = newDate;
        update.start_time_override = newStart;
        update.end_time_override = newEnd;
      }
      // record instructor override only if it differs from booking-level instructor
      if (newInstructorId !== baseInstructorId) {
        update.instructor_override_id = newInstructorId;
        update.instructor_override_name = newInstructorName;
      } else {
        update.instructor_override_id = null;
        update.instructor_override_name = null;
      }

      const { error: uErr } = await supabaseAdmin
        .from("lesson_booking_occurrences")
        .update(update)
        .eq("id", occ.id);
      if (uErr) throw uErr;

      movedSummary.push({
        oldDate: fmtDateLabel(occ.occurrence_date),
        oldTime: `${fmtTimeLabel(occ.start_time_override || baseStart)} – ${fmtTimeLabel(occ.end_time_override || baseEnd)}`,
        oldInstructor: occ.instructor_override_name || baseInstructorName || "your instructor",
        newDate: fmtDateLabel(newDate),
        newTime: `${fmtTimeLabel(newStart)} – ${fmtTimeLabel(newEnd)}`,
        newInstructor: newInstructorName,
      });
    } else if (body.mode === "remaining") {
      if (!body.new_date || !body.new_start) {
        return j({ error: "new_date and new_start are required for 'remaining' mode" }, 400);
      }
      const newInstructorId = body.new_instructor_id ?? baseInstructorId;
      const newInstructorName = body.new_instructor_name || baseInstructorName || "";
      if (!newInstructorId) return j({ error: "Instructor required" }, 400);

      const newStart = norm(body.new_start);
      const totalEnd = toMin(newStart) + lengthMin;
      const newEnd = norm(body.new_end || `${String(Math.floor(totalEnd / 60) % 24).padStart(2, "0")}:${String(totalEnd % 60).padStart(2, "0")}`);
      const targetWeekday = new Date(body.new_date + "T00:00").getDay();

      // Order remaining occurrences by date (future, not cancelled)
      const remaining = ((booking as any).lesson_booking_occurrences as any[])
        .filter((o) => o.status !== "cancelled" && o.occurrence_date >= todayIso)
        .sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date));
      if (remaining.length === 0) return j({ error: "No future occurrences to move" }, 400);

      // Compute new dates: first remaining → next occurrence of targetWeekday on/after new_date,
      // subsequent ones → +7 days each.
      let cursor = nextWeekdayOnOrAfter(body.new_date, targetWeekday);
      const allIds = remaining.map((o) => o.id);
      const moves: { id: string; oldDate: string; newDate: string }[] = [];
      for (const o of remaining) {
        moves.push({ id: o.id, oldDate: o.occurrence_date, newDate: cursor });
        cursor = addDaysIso(cursor, 7);
      }

      // Validate every target slot
      for (const m of moves) {
        const err = await validateSlot({
          date: m.newDate, start: newStart, end: newEnd,
          instructor_id: newInstructorId, pool_area: poolArea,
          ignore_occurrence_ids: allIds,
        });
        if (err) return j({ error: `${err} (while moving ${fmtDateLabel(m.oldDate)})` }, 409);
      }

      // Apply: update booking series defaults + each occurrence (clear overrides; series owns it now)
      const { error: bUpd } = await supabaseAdmin
        .from("lesson_bookings")
        .update({
          instructor_id: newInstructorId,
          instructor_name: newInstructorName,
          start_time: newStart,
          end_time: newEnd,
          day_of_week: ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][targetWeekday],
          series_start: moves[0].newDate,
          series_end: moves[moves.length - 1].newDate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id);
      if (bUpd) throw bUpd;

      for (const m of moves) {
        const { error: uErr } = await supabaseAdmin
          .from("lesson_booking_occurrences")
          .update({
            occurrence_date: m.newDate,
            start_time_override: null,
            end_time_override: null,
            instructor_override_id: null,
            instructor_override_name: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", m.id);
        if (uErr) throw uErr;
      }

      movedSummary.push(...moves.map((m) => ({
        oldDate: fmtDateLabel(m.oldDate),
        oldTime: `${fmtTimeLabel(baseStart)} – ${fmtTimeLabel(baseEnd)}`,
        oldInstructor: baseInstructorName || "your instructor",
        newDate: fmtDateLabel(m.newDate),
        newTime: `${fmtTimeLabel(newStart)} – ${fmtTimeLabel(newEnd)}`,
        newInstructor: newInstructorName,
      })));
    }

    // Email parent
    if (body.notify !== false && (booking as any).parent_email) {
      try {
        await supabaseAdmin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "private-lesson-rescheduled",
            recipientEmail: (booking as any).parent_email,
            idempotencyKey: `reschedule-${booking.id}-${Date.now()}`,
            templateData: {
              parentName: (booking as any).parent_first_name || (booking as any).parent_name,
              childName: (booking as any).child_name || (booking as any).parent_name,
              cancellationPolicyHours: (booking as any).cancellation_policy_hours || 24,
              reason: body.reason,
              items: movedSummary,
            },
          },
        });
      } catch (e) {
        console.error("send reschedule email failed", e);
      }
    }

    return j({ success: true, moved: movedSummary.length });
  } catch (err: any) {
    console.error("reschedule-private-lesson-occurrence error", err);
    return j({ error: err?.message || "Internal error" }, 500);
  }
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
