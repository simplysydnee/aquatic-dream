// Admin-only: invite or link a login account to an instructor record.
// - If a user with the given email already exists: link it.
// - Otherwise: invite them (sends Supabase invite email) and link the new user.
// Either way, grants the 'instructor' role.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Invalid auth token" }, 401);

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Admin role required" }, 403);

    const { instructor_id, email } = await req.json();
    if (!instructor_id || !email) {
      return json({ error: "instructor_id and email are required" }, 400);
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Find existing user with this email
    let userId: string | null = null;
    let invited = false;

    // Lookup via listUsers (paginated). For small teams this is fine.
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === normalizedEmail);

    if (existing) {
      userId = existing.id;
    } else {
      const { data: invite, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        normalizedEmail,
        { redirectTo: `${new URL(req.url).origin.replace(/\/functions.*/, "")}/admin/login` }
      );
      if (inviteErr || !invite?.user) {
        return json({ error: `Invite failed: ${inviteErr?.message || "unknown"}` }, 500);
      }
      userId = invite.user.id;
      invited = true;
    }

    // Link instructor → user
    const { error: linkErr } = await supabaseAdmin
      .from("instructors")
      .update({ user_id: userId, email: normalizedEmail })
      .eq("id", instructor_id);
    if (linkErr) return json({ error: `Link failed: ${linkErr.message}` }, 500);

    // Grant instructor role (idempotent)
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "instructor" }, { onConflict: "user_id,role" });
    if (roleErr) return json({ error: `Role grant failed: ${roleErr.message}` }, 500);

    return json({ success: true, user_id: userId, invited });
  } catch (err) {
    console.error("invite-instructor error", err);
    return json({ error: String(err) }, 500);
  }
});
