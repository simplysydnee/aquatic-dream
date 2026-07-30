// Public, token-scoped release: a parent who cannot make the held time frees
// the spot themselves. Only flips a live hold to 'cancelled'. No other writes.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "");
    if (!token) return json({ error: "Missing token" }, 400);

    const { data: hold, error } = await supabase
      .from("membership_holds")
      .select("id, status")
      .eq("token", token)
      .maybeSingle();
    if (error || !hold) return json({ error: "Not found" }, 404);

    if (hold.status !== "held") {
      return json({ success: true, status: hold.status, alreadyReleased: true });
    }

    const { error: updErr } = await supabase
      .from("membership_holds")
      .update({ status: "cancelled" })
      .eq("id", hold.id)
      .eq("status", "held");
    if (updErr) return json({ error: "Could not release the hold" }, 500);

    return json({ success: true, status: "cancelled" });
  } catch (e) {
    console.error("[release-membership-hold] error", e);
    return json({ error: "Something went wrong" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
