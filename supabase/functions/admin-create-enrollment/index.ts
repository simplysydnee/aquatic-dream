// Admin-only edge function for creating enrollments OUTSIDE the Stripe flow.
// Use cases: walk-ins, cash payments, comps, manual reconciliation.
//
// Every row created here MUST include payment_method + payment_reference so the
// admin dashboard can audit "how do we know this person paid?" in 1 second.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VALID_METHODS = ["stripe", "cash", "check", "comp", "walk_in"] as const;
type PaymentMethod = typeof VALID_METHODS[number];

interface AdminEnrollmentInput {
  childName: string;
  childAge: number;
  swimLevel: string;
  sessionId: string;
  parentName: string;
  parentEmail: string;
  parentPhone?: string | null;
  isFirstTime: boolean;
  paymentMethod: PaymentMethod;
  paymentReference: string;        // Stripe charge id, receipt #, or "comp - reason"
  paymentStatus: "paid" | "unpaid"; // walk-ins paying day-1 might be 'unpaid'
  paymentAmount: number | null;
  notes?: string | null;
  isWalkIn?: boolean;              // also create today's attendance row
  walkInDate?: string;             // YYYY-MM-DD
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate the caller and require admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ error: "Invalid auth token" }, 401);
    }

    const { data: isAdmin, error: roleErr } = await supabaseAdmin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return json({ error: "Admin role required" }, 403);
    }

    const body: AdminEnrollmentInput = await req.json();

    // Validation
    if (!body.childName || !body.swimLevel || !body.sessionId || !body.parentName || !body.parentEmail) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (!VALID_METHODS.includes(body.paymentMethod)) {
      return json({ error: `paymentMethod must be one of ${VALID_METHODS.join(", ")}` }, 400);
    }
    if (!body.paymentReference || body.paymentReference.trim().length === 0) {
      return json({ error: "paymentReference is required (Stripe charge id, receipt #, or note)" }, 400);
    }

    const insertRow = {
      child_name: body.childName.trim(),
      child_age: body.childAge,
      swim_level: body.swimLevel,
      session_id: body.sessionId,
      parent_name: body.parentName.trim(),
      parent_email: body.parentEmail.trim(),
      parent_phone: body.parentPhone?.trim() || null,
      is_first_time: body.isFirstTime,
      registration_fee: body.isFirstTime ? 45 : 0,
      payment_status: body.paymentStatus,
      payment_amount: body.paymentAmount,
      payment_method: body.paymentMethod,
      payment_reference: body.paymentReference.trim(),
      status: "confirmed",
      lesson_type: "group",
      notes: body.notes?.trim() || null,
    };

    const { data: enrollment, error: enrollErr } = await supabaseAdmin
      .from("swim_enrollments")
      .insert(insertRow)
      .select("id")
      .single();

    if (enrollErr || !enrollment) {
      return json({ error: enrollErr?.message || "Insert failed" }, 500);
    }

    // Optionally check the swimmer in for today's attendance
    if (body.isWalkIn && body.walkInDate) {
      await supabaseAdmin.from("attendance").insert({
        enrollment_id: enrollment.id,
        session_id: body.sessionId,
        lesson_date: body.walkInDate,
        checked_in: true,
        checked_in_at: new Date().toISOString(),
        checked_in_by: userData.user.email || "admin",
      });
    }

    return json({ success: true, enrollmentId: enrollment.id }, 200);
  } catch (e) {
    console.error("admin-create-enrollment error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
