// Admin-only: resend the private/semi-private booking confirmation email
// (card-on-file flow, no payment link). Accepts a single booking_id or an array.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { sendPrivateBookingConfirmation } from "../_shared/send-private-booking-confirmation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.union([
  z.object({ booking_id: z.string().uuid() }),
  z.object({ booking_ids: z.array(z.string().uuid()).min(1).max(200) }),
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: must be a logged-in admin.
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return j({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7);
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user) return j({ error: "Unauthorized" }, 401);

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return j({ error: "Admin only" }, 403);

  let bodyJson: unknown;
  try { bodyJson = await req.json(); } catch { return j({ error: "Invalid JSON" }, 400); }
  const parsed = BodySchema.safeParse(bodyJson);
  if (!parsed.success) return j({ error: parsed.error.flatten() }, 400);

  const ids = "booking_id" in parsed.data ? [parsed.data.booking_id] : parsed.data.booking_ids;

  const results: { booking_id: string; success: boolean; error?: string }[] = [];
  for (const id of ids) {
    try {
      const r = await sendPrivateBookingConfirmation(supabase, id, { mode: "resend" });
      results.push({ booking_id: id, success: r.ok, error: r.error });
    } catch (e: any) {
      results.push({ booking_id: id, success: false, error: e?.message || String(e) });
    }
  }

  const sent = results.filter((r) => r.success).length;
  return j({ sent, total: results.length, results });
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
