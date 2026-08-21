// Admin-only: provision the shared staff-kiosk login.
// Creates (or reuses) an auth user and guarantees its staff_kiosk_accounts row.
// The kiosk gets NO user_roles entry: its only authority is the kiosk row,
// which the staff_* SECURITY DEFINER functions check via can_use_staff_mode().
// The password is never logged, stored outside auth, or echoed back.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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

    const body = (await req.json()) as {
      email?: unknown;
      password?: unknown;
      label?: unknown;
    };

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";

    if (!email || !email.includes("@")) return json({ error: "A valid email is required" }, 400);
    if (!label) return json({ error: "A label is required" }, 400);
    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }

    // Idempotent: reuse an existing auth user with this email.
    let userId: string | null = null;
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);

    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr || !created?.user) {
        return json({ error: `Could not create kiosk user: ${createErr?.message ?? "unknown"}` }, 500);
      }
      userId = created.user.id;
    }

    const { data: existingRow, error: rowErr } = await supabaseAdmin
      .from("staff_kiosk_accounts")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (rowErr) return json({ error: `Kiosk row lookup failed: ${rowErr.message}` }, 500);

    let kioskRowCreated = false;
    if (!existingRow) {
      const { error: insertErr } = await supabaseAdmin
        .from("staff_kiosk_accounts")
        .insert({ user_id: userId, label });
      if (insertErr) return json({ error: `Kiosk row insert failed: ${insertErr.message}` }, 500);
      kioskRowCreated = true;
    }

    return json({ user_id: userId, email, label, kiosk_row_created: kioskRowCreated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});
