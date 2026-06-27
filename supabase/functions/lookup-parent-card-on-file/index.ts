// Admin-gated: given a parent email, find a valid Stripe PaymentMethod
// already on file from any prior lesson_bookings row and return a
// sanitized summary so the booking wizard can offer to reuse it.
//
// Validation logic lives in _shared/card-on-file.ts so other edge
// functions (admin in-person, public self-serve) can reuse it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { findReusableCardForEmail } from "../_shared/card-on-file.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  parent_email: z.string().email(),
  environment: z.enum(["sandbox", "live"]).default("live"),
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
    if (!authHeader) return j({ error: "Missing Authorization" }, 401);
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
    const { parent_email, environment } = parsed.data;

    const stripe = createStripeClient(environment as StripeEnv);
    const result = await findReusableCardForEmail(supabaseAdmin, stripe, parent_email);

    if (!result.found) {
      return j({ found: false, reason: result.reason });
    }

    return j({
      found: true,
      brand: result.brand,
      last4: result.last4,
      exp_month: result.exp_month,
      exp_year: result.exp_year,
      source_booking_id: result.source_booking_id,
      source_child_name: result.source_child_name,
      source_instructor_name: result.source_instructor_name,
      stripe_customer_id: result.stripe_customer_id,
      stripe_payment_method_id: result.stripe_payment_method_id,
    });
  } catch (err: any) {
    console.error("lookup-parent-card-on-file error", err);
    return j({ error: err?.message || "Internal error" }, 500);
  }
});
