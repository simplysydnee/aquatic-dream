// Admin-only: manually create a private or semi-private lesson booking
// (single date or recurring weekly series). No Stripe card required.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { getPrivateLessonPrice } from "../_shared/private-lesson-pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  instructor_id: z.string().uuid(),
  lesson_type: z.enum(["private", "semi_private"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  pool_area: z.string().default("shallow"),
  parent_name: z.string().min(1).max(200),
  parent_email: z.string().email(),
  parent_phone: z.string().max(40).optional().nullable(),
  child_name: z.string().max(200).optional().nullable(),
  child_age: z.number().int().min(0).max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  recurring: z.boolean().default(false),
  series_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  price_per_session: z.number().positive().optional(),
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return j({ error: "Missing Authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return j({ error: "Invalid auth token" }, 401);
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return j({ error: "Admin role required" }, 403);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return j({ error: parsed.error.flatten() }, 400);
    const p = parsed.data;

    const { data: instr } = await supabaseAdmin
      .from("instructors")
      .select("name")
      .eq("id", p.instructor_id)
      .maybeSingle();
    const instructorName = (instr as any)?.name || "Instructor";

    // Snapshot price = price for the first occurrence. Charge-time logic
    // re-derives per occurrence, so a series straddling June still bills
    // $50 for June dates and $65 for July dates automatically.
    const defaultPrice = getPrivateLessonPrice(p.lesson_type, p.start_date);
    const price = p.price_per_session ?? defaultPrice;

    // Build occurrence dates
    const dates: string[] = [];
    const start = new Date(p.start_date + "T00:00");
    if (p.recurring && p.series_end) {
      const end = new Date(p.series_end + "T00:00");
      const cur = new Date(start);
      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, "0");
        const d = String(cur.getDate()).padStart(2, "0");
        dates.push(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 7);
      }
    } else {
      dates.push(p.start_date);
    }

    const seriesEnd = dates[dates.length - 1];

    const { data: booking, error: bErr } = await supabaseAdmin
      .from("lesson_bookings")
      .insert({
        lesson_type: p.lesson_type,
        instructor_id: p.instructor_id,
        instructor_name: instructorName,
        parent_name: p.parent_name,
        parent_email: p.parent_email,
        parent_phone: p.parent_phone || null,
        child_name: p.child_name || null,
        child_age: p.child_age ?? null,
        start_time: p.start_time,
        end_time: p.end_time,
        pool_area: p.pool_area,
        price_per_session: price,
        series_start: p.start_date,
        series_end: seriesEnd,
        recurring: !!p.recurring,
        frequency: p.recurring ? "weekly" : null,
        notes: p.notes || null,
        status: "active",
        booking_source: "admin",
      })
      .select("id")
      .single();
    if (bErr) throw bErr;

    const bookingId = (booking as any).id;

    const occRows = dates.map((d) => ({
      booking_id: bookingId,
      occurrence_date: d,
      status: "scheduled",
      payment_status: "unpaid",
      auto_charge_status: "skipped",
    }));
    const { error: oErr } = await supabaseAdmin
      .from("lesson_booking_occurrences")
      .insert(occRows);
    if (oErr) {
      await supabaseAdmin.from("lesson_bookings").delete().eq("id", bookingId);
      throw oErr;
    }

    return j({ success: true, booking_id: bookingId, occurrences: dates.length });
  } catch (err: any) {
    console.error("admin-create-private-booking error", err);
    return j({ error: err?.message || "Internal error" }, 500);
  }
});
