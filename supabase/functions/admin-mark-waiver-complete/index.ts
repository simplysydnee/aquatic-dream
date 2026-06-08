import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Identify caller via their JWT and check admin role
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: hasRoleData, error: roleErr } = await admin.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (roleErr || !hasRoleData) return json({ error: "Forbidden" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const {
    targetType,
    targetId,
    signerName,
    signerEmail,
    note,
    photoRelease,
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactRelationship,
  } = body || {};

  if (!["lesson_booking", "enrollment"].includes(targetType)) {
    return json({ error: "Invalid targetType" }, 400);
  }
  if (!targetId || typeof targetId !== "string") return json({ error: "Invalid targetId" }, 400);
  if (!signerName || typeof signerName !== "string") return json({ error: "signerName required" }, 400);

  // Look up parent_email if not provided
  let resolvedEmail = signerEmail as string | undefined;
  if (!resolvedEmail) {
    const table = targetType === "lesson_booking" ? "lesson_bookings" : "swim_enrollments";
    const { data: row } = await admin.from(table).select("parent_email").eq("id", targetId).maybeSingle();
    resolvedEmail = (row as any)?.parent_email;
  }
  if (!resolvedEmail) return json({ error: "Could not resolve signer email" }, 400);

  const insertRow: Record<string, unknown> = {
    signer_name: signerName,
    signer_email: resolvedEmail,
    signature_text: `Manually marked complete by admin (${user.email || user.id})${note ? ` — ${note}` : ""}`,
    waiver_accepted: true,
    privacy_policy_accepted: true,
    terms_accepted: true,
    photo_release_accepted: photoRelease === true,
    emergency_contact_name: emergencyContactName || "Provided in person",
    emergency_contact_phone: emergencyContactPhone || "n/a",
    emergency_contact_relationship: emergencyContactRelationship || "Parent/Guardian",
  };
  if (targetType === "lesson_booking") insertRow.lesson_booking_id = targetId;
  else insertRow.enrollment_id = targetId;

  const { error: agErr } = await admin.from("enrollment_agreements").insert(insertRow as any);
  if (agErr) return json({ error: agErr.message }, 500);

  if (targetType === "lesson_booking") {
    const { error: updErr } = await admin
      .from("lesson_bookings")
      .update({ waiver_signed_at: new Date().toISOString() })
      .eq("id", targetId);
    if (updErr) return json({ error: updErr.message }, 500);
  } else if (targetType === "enrollment") {
    const { error: updErr } = await admin
      .from("swim_enrollments")
      .update({ waiver_signed_at: new Date().toISOString() })
      .eq("id", targetId);
    if (updErr) return json({ error: updErr.message }, 500);
  }

  return json({ success: true });
});
