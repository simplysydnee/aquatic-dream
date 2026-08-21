// Admin-only: provision the shared pool-deck kiosk login.
// Creates (or reuses) an auth user and guarantees its staff_kiosk_accounts row.
// The kiosk gets NO user_roles row: its only authority is that kiosk row.
// The password is never logged, stored outside auth, or echoed back.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const body = (await req.json().catch(() => null)) as
      | { email?: unknown; password?: unknown; label?: unknown }
      | null;
    if (!body) return json({ error: "Invalid JSON body" }, 400);

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "A valid email is required" }, 400);
    }
    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }
    if (!label || label.length > 120) {
      return json({ error: "A label is required (max 120 characters)" }, 400);
    }

    // Reuse an existing account rather than failing: the common re-run case is
    // "user exists but the kiosk row was never written".
    let userId: string | null = null;
    let page = 1;
    const perPage = 1000;
    while (userId === null) {
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (listErr) return json({ error: "Could not read existing users" }, 500);

      const users = list?.users ?? [];
      const existing = users.find((u) => u.email?.toLowerCase() === email);
      if (existing) {
        userId = existing.id;
        break;
      }
      if (users.length < perPage) break;
      page++;
    }

    if (userId === null) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr || !created?.user) {
        return json({ error: createErr?.message ?? "Could not create kiosk user" }, 400);
      }
      userId = created.user.id;
    }

    const { data: existingRow, error: rowErr } = await supabaseAdmin
      .from("staff_kiosk_accounts")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (rowErr) return json({ error: "Could not read staff_kiosk_accounts" }, 500);

    let kioskRowCreated = false;
    if (!existingRow) {
      const { error: insertErr } = await supabaseAdmin
        .from("staff_kiosk_accounts")
        .insert({ user_id: userId, label });
      if (insertErr) {
        return json({ error: `Could not create kiosk row: ${insertErr.message}` }, 500);
      }
      kioskRowCreated = true;
    }

    return json({ user_id: userId, email, label, kiosk_row_created: kioskRowCreated });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
