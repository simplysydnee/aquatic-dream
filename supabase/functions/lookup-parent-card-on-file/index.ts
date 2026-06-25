// Admin-gated: given a parent email, find a valid Stripe PaymentMethod
// already on file from any prior lesson_bookings row and return a
// sanitized summary so the booking wizard can offer to reuse it.
//
// "Valid" means: PM exists in Stripe, is type=card, is still attached to
// the same customer recorded in our DB, and is not past its expiry month.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

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

function isExpired(month: number, year: number): boolean {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  if (year < y) return true;
  if (year === y && month < m) return true;
  return false;
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

    const email = parent_email.toLowerCase().trim();

    // Newest-first candidates across all this parent's bookings.
    const { data: rows, error: qErr } = await supabaseAdmin
      .from("lesson_bookings")
      .select("id, stripe_customer_id, stripe_payment_method_id, child_name, instructor_name, updated_at")
      .ilike("parent_email", email)
      .not("stripe_customer_id", "is", null)
      .not("stripe_payment_method_id", "is", null)
      .neq("status", "cancelled")
      .order("updated_at", { ascending: false })
      .limit(10);
    if (qErr) throw qErr;

    const candidates = ((rows as any[]) || []) as Array<{
      id: string;
      stripe_customer_id: string;
      stripe_payment_method_id: string;
      child_name: string | null;
      instructor_name: string | null;
      updated_at: string;
    }>;

    if (candidates.length === 0) {
      return j({ found: false, reason: "no_prior_pm" });
    }

    const stripe = createStripeClient(environment as StripeEnv);

    // Dedupe by PM id while preserving order.
    const seen = new Set<string>();
    const ordered = candidates.filter((c) => {
      if (seen.has(c.stripe_payment_method_id)) return false;
      seen.add(c.stripe_payment_method_id);
      return true;
    });

    for (const c of ordered) {
      try {
        const pm = await stripe.paymentMethods.retrieve(c.stripe_payment_method_id);
        if (pm.type !== "card" || !pm.card) continue;
        const pmCustomer = typeof pm.customer === "string" ? pm.customer : pm.customer?.id ?? null;
        if (!pmCustomer || pmCustomer !== c.stripe_customer_id) continue;
        if (isExpired(pm.card.exp_month, pm.card.exp_year)) continue;

        return j({
          found: true,
          brand: pm.card.brand,
          last4: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
          source_booking_id: c.id,
          source_child_name: c.child_name,
          source_instructor_name: c.instructor_name,
          stripe_customer_id: c.stripe_customer_id,
          stripe_payment_method_id: c.stripe_payment_method_id,
        });
      } catch (e) {
        // 404 / detached / API error → try the next candidate.
        console.warn("lookup-parent-card-on-file: candidate skipped", c.stripe_payment_method_id, e instanceof Error ? e.message : String(e));
        continue;
      }
    }

    return j({ found: false, reason: "all_candidates_invalid" });
  } catch (err: any) {
    console.error("lookup-parent-card-on-file error", err);
    return j({ error: err?.message || "Internal error" }, 500);
  }
});
