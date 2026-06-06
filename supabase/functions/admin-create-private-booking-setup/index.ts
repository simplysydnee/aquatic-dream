// Admin-only: create a Stripe Customer (or reuse existing by email) and
// return an Embedded Checkout (setup mode) client_secret so the admin can
// collect & save a card on file during manual booking.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  environment: z.enum(["sandbox", "live"]),
  parent_first_name: z.string().min(1).max(80),
  parent_last_name: z.string().min(1).max(80),
  parent_email: z.string().email(),
  parent_phone: z.string().max(40).optional().nullable(),
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
    const body = parsed.data;

    const stripe = createStripeClient(body.environment as StripeEnv);
    const existing = await stripe.customers.list({ email: body.parent_email, limit: 1 });
    const customerId = existing.data[0]?.id
      ?? (await stripe.customers.create({
          email: body.parent_email,
          name: `${body.parent_first_name} ${body.parent_last_name}`,
          phone: body.parent_phone || undefined,
      })).id;

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      ui_mode: "embedded_page",
      customer: customerId,
      currency: "usd",
      payment_method_types: ["card"],
      redirect_on_completion: "never",
      metadata: { type: "admin_private_lesson_card_on_file" },
    });

    return j({
      client_secret: session.client_secret,
      checkout_session_id: session.id,
      customer_id: customerId,
    });
  } catch (err: any) {
    console.error("admin-create-private-booking-setup error", err);
    return j({ error: err?.message || "Internal error" }, 500);
  }
});
